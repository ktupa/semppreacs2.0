# app/ml/latency_predictor.py
"""
LatencyPredictor - Modelo de predição de latência para dispositivos CPE.

Utiliza análise estatística e regressão simples para prever latência futura
com base no histórico de métricas coletadas.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass, field
import statistics
import math

log = logging.getLogger("semppre-bridge.ml.latency")


@dataclass
class LatencyPrediction:
    """Resultado de uma predição de latência."""
    device_id: str
    predicted_latency_ms: float
    confidence: float  # 0.0 a 1.0
    trend: str  # "stable", "increasing", "decreasing"
    risk_level: str  # "low", "medium", "high", "critical"
    predicted_for: datetime
    analysis_window_hours: int
    sample_count: int
    
    # Métricas estatísticas
    current_avg: float
    current_std: float
    current_min: float
    current_max: float
    
    # Insights
    insights: List[str] = field(default_factory=list)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "device_id": self.device_id,
            "predicted_latency_ms": round(self.predicted_latency_ms, 2),
            "confidence": round(self.confidence, 2),
            "trend": self.trend,
            "risk_level": self.risk_level,
            "predicted_for": self.predicted_for.isoformat(),
            "analysis_window_hours": self.analysis_window_hours,
            "sample_count": self.sample_count,
            "statistics": {
                "current_avg": round(self.current_avg, 2),
                "current_std": round(self.current_std, 2),
                "current_min": round(self.current_min, 2),
                "current_max": round(self.current_max, 2),
            },
            "insights": self.insights,
        }


class LatencyPredictor:
    """
    Preditor de latência baseado em análise estatística.
    
    Funcionalidades:
    - Análise de tendência (slope) via regressão linear simples
    - Detecção de anomalias via desvio padrão
    - Classificação de risco baseada em thresholds configuráveis
    - Predição de latência futura
    """
    
    # Thresholds de latência (ms)
    LATENCY_THRESHOLDS = {
        "excellent": 20,
        "good": 50,
        "fair": 100,
        "poor": 200,
        "critical": 500,
    }
    
    # Thresholds de risco
    RISK_THRESHOLDS = {
        "low": 50,
        "medium": 100,
        "high": 200,
        "critical": 500,
    }
    
    def __init__(self, anomaly_threshold_std: float = 2.5):
        """
        Args:
            anomaly_threshold_std: Número de desvios padrão para considerar anomalia
        """
        self.anomaly_threshold_std = anomaly_threshold_std
    
    def predict(
        self,
        device_id: str,
        latency_samples: List[Tuple[datetime, float]],
        prediction_horizon_minutes: int = 60,
    ) -> LatencyPrediction:
        """
        Faz predição de latência baseada em histórico.
        
        Args:
            device_id: ID do dispositivo
            latency_samples: Lista de tuplas (timestamp, latency_ms)
            prediction_horizon_minutes: Horizonte de predição em minutos
            
        Returns:
            LatencyPrediction com o resultado
        """
        if not latency_samples:
            return self._empty_prediction(device_id)
        
        # Ordenar por timestamp
        sorted_samples = sorted(latency_samples, key=lambda x: x[0])
        values = [s[1] for s in sorted_samples]
        timestamps = [s[0] for s in sorted_samples]
        
        # Estatísticas básicas
        avg = statistics.mean(values)
        std = statistics.stdev(values) if len(values) > 1 else 0
        min_val = min(values)
        max_val = max(values)
        
        # Calcular janela de análise
        if len(timestamps) >= 2:
            window_hours = (timestamps[-1] - timestamps[0]).total_seconds() / 3600
        else:
            window_hours = 0
        
        # Calcular tendência via regressão linear
        trend, slope = self._calculate_trend(sorted_samples)
        
        # Predição futura
        predicted_latency = self._predict_future_latency(
            avg, slope, prediction_horizon_minutes
        )
        
        # Calcular confiança
        confidence = self._calculate_confidence(len(values), std, avg)
        
        # Determinar nível de risco
        risk_level = self._classify_risk(predicted_latency, std)
        
        # Gerar insights
        insights = self._generate_insights(
            avg, std, trend, predicted_latency, min_val, max_val
        )
        
        return LatencyPrediction(
            device_id=device_id,
            predicted_latency_ms=predicted_latency,
            confidence=confidence,
            trend=trend,
            risk_level=risk_level,
            predicted_for=datetime.utcnow() + timedelta(minutes=prediction_horizon_minutes),
            analysis_window_hours=int(window_hours),
            sample_count=len(values),
            current_avg=avg,
            current_std=std,
            current_min=min_val,
            current_max=max_val,
            insights=insights,
        )
    
    def _calculate_trend(
        self, samples: List[Tuple[datetime, float]]
    ) -> Tuple[str, float]:
        """
        Calcula tendência via regressão linear simples.
        
        Returns:
            Tuple de (trend_label, slope)
        """
        if len(samples) < 3:
            return ("stable", 0.0)
        
        # Converter timestamps para minutos desde o primeiro ponto
        base_time = samples[0][0]
        x_values = [(s[0] - base_time).total_seconds() / 60 for s in samples]
        y_values = [s[1] for s in samples]
        
        # Regressão linear simples: y = mx + b
        n = len(x_values)
        sum_x = sum(x_values)
        sum_y = sum(y_values)
        sum_xy = sum(x * y for x, y in zip(x_values, y_values))
        sum_x2 = sum(x ** 2 for x in x_values)
        
        denominator = n * sum_x2 - sum_x ** 2
        if abs(denominator) < 1e-10:
            return ("stable", 0.0)
        
        slope = (n * sum_xy - sum_x * sum_y) / denominator
        
        # Classificar tendência baseado no slope
        # slope está em ms/minuto
        avg_latency = statistics.mean(y_values)
        relative_slope = slope / max(avg_latency, 1) * 100  # % por minuto
        
        if relative_slope > 0.5:  # aumento > 0.5% por minuto
            trend = "increasing"
        elif relative_slope < -0.5:  # diminuição > 0.5% por minuto
            trend = "decreasing"
        else:
            trend = "stable"
        
        return (trend, slope)
    
    def _predict_future_latency(
        self, current_avg: float, slope: float, horizon_minutes: int
    ) -> float:
        """Prediz latência futura baseado na média atual e slope."""
        predicted = current_avg + (slope * horizon_minutes)
        # Clamp para valores razoáveis
        return max(1.0, min(predicted, 10000.0))
    
    def _calculate_confidence(
        self, sample_count: int, std: float, avg: float
    ) -> float:
        """
        Calcula confiança da predição.
        
        Fatores:
        - Quantidade de amostras (mais = melhor)
        - Variabilidade (menos = melhor)
        """
        # Confiança por quantidade de amostras (0.3 a 1.0)
        sample_confidence = min(1.0, 0.3 + (sample_count / 100) * 0.7)
        
        # Confiança por variabilidade (coeficiente de variação)
        if avg > 0:
            cv = std / avg  # coeficiente de variação
            variability_confidence = max(0.3, 1.0 - cv)
        else:
            variability_confidence = 0.5
        
        # Média ponderada
        return sample_confidence * 0.4 + variability_confidence * 0.6
    
    def _classify_risk(self, latency: float, std: float) -> str:
        """Classifica nível de risco baseado na latência predita."""
        # Latência ajustada (considera variabilidade)
        adjusted_latency = latency + std
        
        if adjusted_latency >= self.RISK_THRESHOLDS["critical"]:
            return "critical"
        elif adjusted_latency >= self.RISK_THRESHOLDS["high"]:
            return "high"
        elif adjusted_latency >= self.RISK_THRESHOLDS["medium"]:
            return "medium"
        else:
            return "low"
    
    def _generate_insights(
        self,
        avg: float,
        std: float,
        trend: str,
        predicted: float,
        min_val: float,
        max_val: float,
    ) -> List[str]:
        """Gera insights baseados na análise."""
        insights = []
        
        # Qualidade atual
        if avg < self.LATENCY_THRESHOLDS["excellent"]:
            insights.append("Latência excelente para aplicações em tempo real")
        elif avg < self.LATENCY_THRESHOLDS["good"]:
            insights.append("Latência boa, adequada para uso geral")
        elif avg < self.LATENCY_THRESHOLDS["fair"]:
            insights.append("Latência moderada, pode impactar jogos e chamadas de vídeo")
        elif avg < self.LATENCY_THRESHOLDS["poor"]:
            insights.append("Latência alta, recomenda-se investigação")
        else:
            insights.append("⚠️ Latência crítica! Ação imediata necessária")
        
        # Tendência
        if trend == "increasing":
            insights.append("📈 Tendência de aumento detectada, monitorar de perto")
        elif trend == "decreasing":
            insights.append("📉 Tendência de melhora detectada")
        
        # Variabilidade
        cv = std / max(avg, 1)
        if cv > 0.5:
            insights.append("⚡ Alta variabilidade (jitter), pode indicar instabilidade de rede")
        elif cv < 0.1:
            insights.append("✓ Latência estável e consistente")
        
        # Picos
        if max_val > avg * 3:
            insights.append(f"⚠️ Picos detectados (máx: {max_val:.0f}ms), possível congestionamento")
        
        # Predição
        if predicted > avg * 1.5:
            insights.append("🔮 Predição indica possível degradação futura")
        
        return insights
    
    def _empty_prediction(self, device_id: str) -> LatencyPrediction:
        """Retorna predição vazia quando não há dados."""
        return LatencyPrediction(
            device_id=device_id,
            predicted_latency_ms=0,
            confidence=0,
            trend="unknown",
            risk_level="unknown",
            predicted_for=datetime.utcnow(),
            analysis_window_hours=0,
            sample_count=0,
            current_avg=0,
            current_std=0,
            current_min=0,
            current_max=0,
            insights=["Dados insuficientes para análise"],
        )
    
    def detect_anomalies(
        self, latency_samples: List[Tuple[datetime, float]]
    ) -> List[Dict[str, Any]]:
        """
        Detecta anomalias nas amostras de latência.
        
        Returns:
            Lista de dicionários com anomalias detectadas
        """
        if len(latency_samples) < 10:
            return []
        
        values = [s[1] for s in latency_samples]
        avg = statistics.mean(values)
        std = statistics.stdev(values)
        
        anomalies = []
        threshold = avg + (std * self.anomaly_threshold_std)
        
        for timestamp, value in latency_samples:
            if value > threshold:
                anomalies.append({
                    "timestamp": timestamp.isoformat(),
                    "latency_ms": round(value, 2),
                    "expected_max": round(threshold, 2),
                    "deviation_std": round((value - avg) / std, 2) if std > 0 else 0,
                    "severity": "high" if value > avg + (std * 4) else "medium",
                })
        
        return anomalies
    
    def get_health_score(
        self, latency_samples: List[Tuple[datetime, float]]
    ) -> Dict[str, Any]:
        """
        Calcula score de saúde de latência (0-100).
        
        Returns:
            Dict com score e breakdown
        """
        if not latency_samples:
            return {"score": 0, "status": "no_data", "breakdown": {}}
        
        values = [s[1] for s in latency_samples]
        avg = statistics.mean(values)
        std = statistics.stdev(values) if len(values) > 1 else 0
        max_val = max(values)
        
        # Score por latência média (0-40 pontos)
        if avg < 20:
            latency_score = 40
        elif avg < 50:
            latency_score = 35
        elif avg < 100:
            latency_score = 25
        elif avg < 200:
            latency_score = 15
        else:
            latency_score = max(0, 40 - (avg / 50))
        
        # Score por estabilidade (0-30 pontos)
        cv = std / max(avg, 1)
        stability_score = max(0, 30 * (1 - min(cv, 1)))
        
        # Score por ausência de picos (0-30 pontos)
        spike_ratio = max_val / max(avg, 1)
        spike_score = max(0, 30 * (1 - min((spike_ratio - 1) / 5, 1)))
        
        total_score = latency_score + stability_score + spike_score
        
        # Status baseado no score
        if total_score >= 80:
            status = "excellent"
        elif total_score >= 60:
            status = "good"
        elif total_score >= 40:
            status = "fair"
        elif total_score >= 20:
            status = "poor"
        else:
            status = "critical"
        
        return {
            "score": round(total_score, 1),
            "status": status,
            "breakdown": {
                "latency_score": round(latency_score, 1),
                "stability_score": round(stability_score, 1),
                "spike_score": round(spike_score, 1),
            },
            "metrics": {
                "avg_latency_ms": round(avg, 2),
                "std_latency_ms": round(std, 2),
                "max_latency_ms": round(max_val, 2),
            },
        }
