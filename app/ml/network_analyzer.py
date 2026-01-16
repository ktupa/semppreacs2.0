# app/ml/network_analyzer.py
"""
Network Analyzer - Análise avançada de rede com Machine Learning.

Este módulo fornece:
- Detecção de anomalias em tempo real
- Correlação de eventos entre dispositivos
- Predição de falhas baseada em padrões
- Segmentação inteligente de rede
- Análise de comportamento de clientes
"""

from __future__ import annotations

import logging
import math
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple
import statistics

log = logging.getLogger("semppre-bridge.ml.network_analyzer")


class TrendDirection(str, Enum):
    """Direção de tendência."""
    INCREASING = "increasing"
    DECREASING = "decreasing"
    STABLE = "stable"
    VOLATILE = "volatile"


class AnomalyType(str, Enum):
    """Tipos de anomalia detectados."""
    LATENCY_SPIKE = "latency_spike"
    PACKET_LOSS_BURST = "packet_loss_burst"
    DISCONNECTION_PATTERN = "disconnection_pattern"
    TRAFFIC_ANOMALY = "traffic_anomaly"
    SECURITY_CONCERN = "security_concern"
    CONFIGURATION_DRIFT = "configuration_drift"
    NEIGHBOR_INTERFERENCE = "neighbor_interference"
    CAPACITY_WARNING = "capacity_warning"


class HealthCategory(str, Enum):
    """Categorias de saúde."""
    EXCELLENT = "excellent"  # 90-100
    GOOD = "good"            # 70-89
    FAIR = "fair"            # 50-69
    POOR = "poor"            # 30-49
    CRITICAL = "critical"    # 0-29


@dataclass
class AnomalyEvent:
    """Evento de anomalia detectado."""
    anomaly_type: AnomalyType
    device_id: str
    timestamp: datetime
    severity: float  # 0.0 - 1.0
    description: str
    affected_metrics: List[str]
    root_cause_probability: Dict[str, float] = field(default_factory=dict)
    recommended_actions: List[str] = field(default_factory=list)
    correlation_id: Optional[str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "anomaly_type": self.anomaly_type.value,
            "device_id": self.device_id,
            "timestamp": self.timestamp.isoformat(),
            "severity": round(self.severity, 3),
            "description": self.description,
            "affected_metrics": self.affected_metrics,
            "root_cause_probability": self.root_cause_probability,
            "recommended_actions": self.recommended_actions,
            "correlation_id": self.correlation_id,
        }


@dataclass
class TrendAnalysis:
    """Análise de tendência."""
    metric_name: str
    direction: TrendDirection
    slope: float  # Taxa de mudança
    r_squared: float  # Qualidade do fit linear
    forecast_24h: float
    forecast_7d: float
    confidence: float
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "metric": self.metric_name,
            "direction": self.direction.value,
            "slope": round(self.slope, 4),
            "r_squared": round(self.r_squared, 3),
            "forecast_24h": round(self.forecast_24h, 2),
            "forecast_7d": round(self.forecast_7d, 2),
            "confidence": round(self.confidence, 3),
        }


@dataclass
class NetworkSegment:
    """Segmento de rede identificado."""
    segment_id: str
    device_ids: List[str]
    characteristics: Dict[str, Any]
    avg_health_score: float
    risk_level: str
    dominant_issues: List[str]
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "segment_id": self.segment_id,
            "device_count": len(self.device_ids),
            "device_ids": self.device_ids[:20],  # Limitar para resposta
            "characteristics": self.characteristics,
            "avg_health_score": round(self.avg_health_score, 1),
            "risk_level": self.risk_level,
            "dominant_issues": self.dominant_issues,
        }


@dataclass
class CorrelatedEvent:
    """Grupo de eventos correlacionados."""
    correlation_id: str
    events: List[AnomalyEvent]
    common_timeframe: Tuple[datetime, datetime]
    shared_characteristics: Dict[str, Any]
    root_cause_hypothesis: str
    confidence: float
    affected_device_count: int
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "correlation_id": self.correlation_id,
            "event_count": len(self.events),
            "affected_devices": self.affected_device_count,
            "timeframe": {
                "start": self.common_timeframe[0].isoformat(),
                "end": self.common_timeframe[1].isoformat(),
            },
            "shared_characteristics": self.shared_characteristics,
            "root_cause_hypothesis": self.root_cause_hypothesis,
            "confidence": round(self.confidence, 3),
        }


class NetworkAnalyzer:
    """
    Analisador avançado de rede com capacidades de ML.
    
    Funcionalidades:
    - Detecção de anomalias usando Z-score e IQR
    - Correlação de eventos entre dispositivos
    - Análise de tendências com regressão linear
    - Segmentação de rede por comportamento
    - Predição de falhas
    """
    
    def __init__(
        self,
        anomaly_threshold: float = 2.5,  # Desvios padrão para anomalia
        correlation_window_minutes: int = 30,
        min_samples_for_trend: int = 10,
    ):
        self.anomaly_threshold = anomaly_threshold
        self.correlation_window = timedelta(minutes=correlation_window_minutes)
        self.min_samples_for_trend = min_samples_for_trend
        
        # Histórico para análise
        self._device_history: Dict[str, List[Dict]] = defaultdict(list)
        self._anomaly_history: List[AnomalyEvent] = []
        self._baseline_metrics: Dict[str, Dict[str, float]] = {}
        
        log.info("NetworkAnalyzer inicializado com threshold=%.2f", anomaly_threshold)
    
    # ============ Detecção de Anomalias ============
    
    def detect_anomalies(
        self,
        device_id: str,
        metrics: Dict[str, List[float]],
        timestamps: Optional[List[datetime]] = None,
    ) -> List[AnomalyEvent]:
        """
        Detecta anomalias em métricas do dispositivo.
        
        Usa múltiplos métodos:
        - Z-Score para desvios estatísticos
        - IQR para outliers
        - Detecção de padrões súbitos
        
        Args:
            device_id: ID do dispositivo
            metrics: Dicionário com nome_metrica -> lista de valores
            timestamps: Lista de timestamps correspondentes
            
        Returns:
            Lista de anomalias detectadas
        """
        anomalies: List[AnomalyEvent] = []
        now = datetime.utcnow()
        
        if not timestamps:
            timestamps = [now - timedelta(minutes=i) for i in range(max(len(v) for v in metrics.values()))]
        
        for metric_name, values in metrics.items():
            if len(values) < 3:
                continue
            
            # Z-Score detection
            z_anomalies = self._detect_zscore_anomalies(values)
            
            # IQR detection
            iqr_anomalies = self._detect_iqr_anomalies(values)
            
            # Combinar e deduplicar
            all_anomaly_indices = set(z_anomalies) | set(iqr_anomalies)
            
            for idx in all_anomaly_indices:
                if idx >= len(timestamps):
                    continue
                
                severity = self._calculate_anomaly_severity(
                    values[idx], 
                    values,
                    in_zscore=idx in z_anomalies,
                    in_iqr=idx in iqr_anomalies,
                )
                
                anomaly_type = self._classify_anomaly_type(metric_name, values, idx)
                
                anomaly = AnomalyEvent(
                    anomaly_type=anomaly_type,
                    device_id=device_id,
                    timestamp=timestamps[idx],
                    severity=severity,
                    description=self._generate_anomaly_description(
                        metric_name, values[idx], values, anomaly_type
                    ),
                    affected_metrics=[metric_name],
                    root_cause_probability=self._estimate_root_causes(
                        metric_name, values, idx, device_id
                    ),
                    recommended_actions=self._generate_recommendations(
                        anomaly_type, severity, metric_name
                    ),
                )
                
                anomalies.append(anomaly)
        
        # Armazenar para correlação futura
        self._anomaly_history.extend(anomalies)
        
        return anomalies
    
    def _detect_zscore_anomalies(self, values: List[float]) -> List[int]:
        """Detecta anomalias usando Z-Score."""
        if len(values) < 3:
            return []
        
        mean = statistics.mean(values)
        stdev = statistics.stdev(values) if len(values) > 1 else 0
        
        if stdev == 0:
            return []
        
        anomalies = []
        for i, v in enumerate(values):
            zscore = abs((v - mean) / stdev)
            if zscore > self.anomaly_threshold:
                anomalies.append(i)
        
        return anomalies
    
    def _detect_iqr_anomalies(self, values: List[float]) -> List[int]:
        """Detecta anomalias usando método IQR."""
        if len(values) < 4:
            return []
        
        sorted_vals = sorted(values)
        n = len(sorted_vals)
        
        q1 = sorted_vals[n // 4]
        q3 = sorted_vals[3 * n // 4]
        iqr = q3 - q1
        
        lower = q1 - 1.5 * iqr
        upper = q3 + 1.5 * iqr
        
        anomalies = []
        for i, v in enumerate(values):
            if v < lower or v > upper:
                anomalies.append(i)
        
        return anomalies
    
    def _calculate_anomaly_severity(
        self,
        value: float,
        all_values: List[float],
        in_zscore: bool,
        in_iqr: bool,
    ) -> float:
        """Calcula severidade da anomalia (0.0 - 1.0)."""
        mean = statistics.mean(all_values)
        stdev = statistics.stdev(all_values) if len(all_values) > 1 else 1
        
        # Desvio normalizado
        deviation = abs(value - mean) / stdev if stdev > 0 else 0
        
        # Base severity pelo desvio
        base_severity = min(deviation / 5.0, 1.0)
        
        # Bonus se detectado por múltiplos métodos
        if in_zscore and in_iqr:
            base_severity = min(base_severity * 1.2, 1.0)
        
        return base_severity
    
    def _classify_anomaly_type(
        self,
        metric_name: str,
        values: List[float],
        anomaly_idx: int,
    ) -> AnomalyType:
        """Classifica o tipo de anomalia baseado na métrica."""
        metric_lower = metric_name.lower()
        
        if "latency" in metric_lower or "ping" in metric_lower:
            return AnomalyType.LATENCY_SPIKE
        elif "loss" in metric_lower or "drop" in metric_lower:
            return AnomalyType.PACKET_LOSS_BURST
        elif "disconnect" in metric_lower or "uptime" in metric_lower:
            return AnomalyType.DISCONNECTION_PATTERN
        elif "traffic" in metric_lower or "bytes" in metric_lower:
            return AnomalyType.TRAFFIC_ANOMALY
        elif "wifi" in metric_lower or "interference" in metric_lower:
            return AnomalyType.NEIGHBOR_INTERFERENCE
        elif "capacity" in metric_lower or "client" in metric_lower:
            return AnomalyType.CAPACITY_WARNING
        else:
            return AnomalyType.CONFIGURATION_DRIFT
    
    def _generate_anomaly_description(
        self,
        metric_name: str,
        value: float,
        all_values: List[float],
        anomaly_type: AnomalyType,
    ) -> str:
        """Gera descrição legível da anomalia."""
        mean = statistics.mean(all_values)
        pct_diff = ((value - mean) / mean * 100) if mean != 0 else 0
        
        direction = "acima" if value > mean else "abaixo"
        
        descriptions = {
            AnomalyType.LATENCY_SPIKE: 
                f"Pico de latência detectado: {value:.1f}ms ({abs(pct_diff):.0f}% {direction} da média)",
            AnomalyType.PACKET_LOSS_BURST:
                f"Burst de perda de pacotes: {value:.1f}% (média: {mean:.1f}%)",
            AnomalyType.DISCONNECTION_PATTERN:
                f"Padrão de desconexão incomum detectado",
            AnomalyType.TRAFFIC_ANOMALY:
                f"Tráfego anômalo: {abs(pct_diff):.0f}% {direction} do normal",
            AnomalyType.NEIGHBOR_INTERFERENCE:
                f"Possível interferência de vizinhos detectada",
            AnomalyType.CAPACITY_WARNING:
                f"Aviso de capacidade: valor {value:.1f} ({direction} do esperado)",
            AnomalyType.CONFIGURATION_DRIFT:
                f"Desvio de configuração em {metric_name}",
        }
        
        return descriptions.get(
            anomaly_type,
            f"Anomalia em {metric_name}: {value:.2f} (média: {mean:.2f})"
        )
    
    def _estimate_root_causes(
        self,
        metric_name: str,
        values: List[float],
        anomaly_idx: int,
        device_id: str,
    ) -> Dict[str, float]:
        """Estima probabilidades de causas raiz."""
        # Análise simplificada de causas prováveis
        causes = {}
        
        metric_lower = metric_name.lower()
        
        if "latency" in metric_lower:
            causes["congestionamento_rede"] = 0.35
            causes["problema_isp"] = 0.25
            causes["sobrecarga_dispositivo"] = 0.20
            causes["interferencia_fisica"] = 0.15
            causes["configuracao_incorreta"] = 0.05
        elif "loss" in metric_lower:
            causes["qualidade_sinal"] = 0.30
            causes["interferencia_wifi"] = 0.25
            causes["cabo_danificado"] = 0.20
            causes["sobrecarga_rede"] = 0.15
            causes["problema_hardware"] = 0.10
        elif "wifi" in metric_lower:
            causes["interferencia_canal"] = 0.35
            causes["muitos_clientes"] = 0.25
            causes["sinal_fraco"] = 0.20
            causes["configuracao_subotima"] = 0.15
            causes["hardware_antigo"] = 0.05
        else:
            causes["causa_desconhecida"] = 0.50
            causes["problema_configuracao"] = 0.30
            causes["falha_transitoria"] = 0.20
        
        return causes
    
    def _generate_recommendations(
        self,
        anomaly_type: AnomalyType,
        severity: float,
        metric_name: str,
    ) -> List[str]:
        """Gera recomendações baseadas no tipo de anomalia."""
        recommendations = []
        
        if anomaly_type == AnomalyType.LATENCY_SPIKE:
            recommendations.append("Verificar carga da rede e CPU do dispositivo")
            if severity > 0.7:
                recommendations.append("Executar diagnóstico completo de rede")
                recommendations.append("Verificar rotas e configuração de QoS")
        
        elif anomaly_type == AnomalyType.PACKET_LOSS_BURST:
            recommendations.append("Verificar qualidade do cabo e conexões físicas")
            recommendations.append("Analisar interferência no canal WiFi")
            if severity > 0.6:
                recommendations.append("Considerar troca de canal WiFi")
        
        elif anomaly_type == AnomalyType.NEIGHBOR_INTERFERENCE:
            recommendations.append("Executar scan de canais WiFi")
            recommendations.append("Considerar migração para canal menos congestionado")
            recommendations.append("Verificar potência de transmissão")
        
        elif anomaly_type == AnomalyType.CAPACITY_WARNING:
            recommendations.append("Verificar número de clientes conectados")
            recommendations.append("Analisar consumo de banda por cliente")
        
        else:
            recommendations.append("Monitorar métrica para identificar padrões")
            recommendations.append("Verificar logs do dispositivo")
        
        return recommendations
    
    # ============ Análise de Tendências ============
    
    def analyze_trend(
        self,
        metric_name: str,
        values: List[float],
        timestamps: Optional[List[datetime]] = None,
    ) -> TrendAnalysis:
        """
        Analisa tendência de uma métrica usando regressão linear.
        
        Args:
            metric_name: Nome da métrica
            values: Lista de valores
            timestamps: Lista de timestamps (opcional)
            
        Returns:
            TrendAnalysis com direção, slope e previsões
        """
        if len(values) < self.min_samples_for_trend:
            return TrendAnalysis(
                metric_name=metric_name,
                direction=TrendDirection.STABLE,
                slope=0.0,
                r_squared=0.0,
                forecast_24h=values[-1] if values else 0,
                forecast_7d=values[-1] if values else 0,
                confidence=0.0,
            )
        
        # Regressão linear simples
        n = len(values)
        x = list(range(n))
        
        x_mean = sum(x) / n
        y_mean = sum(values) / n
        
        # Calcular slope e intercept
        numerator = sum((x[i] - x_mean) * (values[i] - y_mean) for i in range(n))
        denominator = sum((x[i] - x_mean) ** 2 for i in range(n))
        
        if denominator == 0:
            slope = 0
        else:
            slope = numerator / denominator
        
        intercept = y_mean - slope * x_mean
        
        # Calcular R²
        ss_tot = sum((v - y_mean) ** 2 for v in values)
        ss_res = sum((values[i] - (slope * x[i] + intercept)) ** 2 for i in range(n))
        
        r_squared = 1 - (ss_res / ss_tot) if ss_tot > 0 else 0
        r_squared = max(0, min(1, r_squared))  # Clamp entre 0 e 1
        
        # Determinar direção
        if abs(slope) < 0.01:
            direction = TrendDirection.STABLE
        elif slope > 0:
            direction = TrendDirection.INCREASING
        else:
            direction = TrendDirection.DECREASING
        
        # Verificar volatilidade
        stdev = statistics.stdev(values) if len(values) > 1 else 0
        cv = stdev / abs(y_mean) if y_mean != 0 else 0
        
        if cv > 0.5:  # Coeficiente de variação alto
            direction = TrendDirection.VOLATILE
        
        # Previsões
        # Assumindo que cada ponto é ~1 hora
        points_24h = 24
        points_7d = 168
        
        forecast_24h = slope * (n + points_24h) + intercept
        forecast_7d = slope * (n + points_7d) + intercept
        
        # Confiança baseada em R² e quantidade de dados
        confidence = r_squared * min(n / 50, 1.0)
        
        return TrendAnalysis(
            metric_name=metric_name,
            direction=direction,
            slope=slope,
            r_squared=r_squared,
            forecast_24h=forecast_24h,
            forecast_7d=forecast_7d,
            confidence=confidence,
        )
    
    # ============ Correlação de Eventos ============
    
    def correlate_events(
        self,
        anomalies: List[AnomalyEvent],
        time_window_minutes: int = 30,
    ) -> List[CorrelatedEvent]:
        """
        Correlaciona anomalias que ocorreram próximas no tempo.
        
        Identifica eventos que podem ter uma causa comum baseado em:
        - Proximidade temporal
        - Tipo de anomalia similar
        - Características compartilhadas
        """
        if len(anomalies) < 2:
            return []
        
        window = timedelta(minutes=time_window_minutes)
        correlated_groups: List[CorrelatedEvent] = []
        processed = set()
        
        # Ordenar por timestamp
        sorted_anomalies = sorted(anomalies, key=lambda a: a.timestamp)
        
        for i, anomaly in enumerate(sorted_anomalies):
            if i in processed:
                continue
            
            # Encontrar anomalias dentro da janela
            group = [anomaly]
            group_indices = {i}
            
            for j, other in enumerate(sorted_anomalies[i+1:], start=i+1):
                if j in processed:
                    continue
                
                time_diff = abs((other.timestamp - anomaly.timestamp).total_seconds())
                
                if time_diff <= window.total_seconds():
                    # Verificar similaridade de tipo
                    if (other.anomaly_type == anomaly.anomaly_type or 
                        other.severity > 0.6):
                        group.append(other)
                        group_indices.add(j)
            
            # Só criar grupo se tiver mais de um evento
            if len(group) > 1:
                processed.update(group_indices)
                
                # Calcular características compartilhadas
                shared_chars = self._find_shared_characteristics(group)
                
                # Gerar hipótese de causa raiz
                hypothesis = self._generate_root_cause_hypothesis(group, shared_chars)
                
                correlated = CorrelatedEvent(
                    correlation_id=f"corr_{anomaly.timestamp.strftime('%Y%m%d%H%M%S')}_{len(group)}",
                    events=group,
                    common_timeframe=(
                        min(a.timestamp for a in group),
                        max(a.timestamp for a in group),
                    ),
                    shared_characteristics=shared_chars,
                    root_cause_hypothesis=hypothesis,
                    confidence=self._calculate_correlation_confidence(group),
                    affected_device_count=len(set(a.device_id for a in group)),
                )
                
                correlated_groups.append(correlated)
        
        return correlated_groups
    
    def _find_shared_characteristics(
        self,
        anomalies: List[AnomalyEvent],
    ) -> Dict[str, Any]:
        """Identifica características compartilhadas entre anomalias."""
        chars = {}
        
        # Tipos de anomalia
        types = [a.anomaly_type.value for a in anomalies]
        type_counts = defaultdict(int)
        for t in types:
            type_counts[t] += 1
        
        chars["dominant_type"] = max(type_counts, key=type_counts.get)
        chars["type_distribution"] = dict(type_counts)
        
        # Métricas afetadas
        all_metrics = []
        for a in anomalies:
            all_metrics.extend(a.affected_metrics)
        chars["common_metrics"] = list(set(all_metrics))
        
        # Severidade média
        chars["avg_severity"] = sum(a.severity for a in anomalies) / len(anomalies)
        
        return chars
    
    def _generate_root_cause_hypothesis(
        self,
        anomalies: List[AnomalyEvent],
        shared_chars: Dict[str, Any],
    ) -> str:
        """Gera hipótese de causa raiz baseada nos padrões."""
        dominant_type = shared_chars.get("dominant_type", "")
        device_count = len(set(a.device_id for a in anomalies))
        
        if device_count > 3:
            # Problema afetando múltiplos dispositivos
            if "latency" in dominant_type:
                return "Possível congestionamento de rede ou problema no backbone"
            elif "loss" in dominant_type:
                return "Provável problema de infraestrutura afetando múltiplos dispositivos"
            elif "interference" in dominant_type:
                return "Fonte de interferência comum afetando região"
            else:
                return "Evento de rede afetando múltiplos dispositivos simultaneamente"
        else:
            # Problema localizado
            if "latency" in dominant_type:
                return "Problema de conectividade localizado ou sobrecarga de dispositivo"
            elif "loss" in dominant_type:
                return "Qualidade de enlace degradada em dispositivo(s) específico(s)"
            else:
                return "Anomalia localizada requer investigação individual"
    
    def _calculate_correlation_confidence(
        self,
        anomalies: List[AnomalyEvent],
    ) -> float:
        """Calcula confiança da correlação."""
        # Mais eventos = mais confiança
        event_factor = min(len(anomalies) / 5, 1.0)
        
        # Tipos similares = mais confiança
        types = [a.anomaly_type for a in anomalies]
        type_similarity = len(set(types)) / len(types) if types else 0
        type_factor = 1 - type_similarity + 0.3  # Inversamente proporcional à diversidade
        
        # Severidade alta = mais relevante
        avg_severity = sum(a.severity for a in anomalies) / len(anomalies)
        severity_factor = avg_severity
        
        # Combinar fatores
        confidence = (event_factor * 0.4 + type_factor * 0.3 + severity_factor * 0.3)
        
        return min(confidence, 1.0)
    
    # ============ Segmentação de Rede ============
    
    def segment_network(
        self,
        devices: List[Dict[str, Any]],
        segment_by: str = "health",  # health, location, behavior
    ) -> List[NetworkSegment]:
        """
        Segmenta a rede em grupos baseados em características.
        
        Útil para:
        - Identificar grupos problemáticos
        - Priorizar intervenções
        - Análise de padrões regionais
        """
        segments: List[NetworkSegment] = []
        
        if not devices:
            return segments
        
        if segment_by == "health":
            segments = self._segment_by_health(devices)
        elif segment_by == "behavior":
            segments = self._segment_by_behavior(devices)
        else:
            # Default: agrupar por score de saúde
            segments = self._segment_by_health(devices)
        
        return segments
    
    def _segment_by_health(
        self,
        devices: List[Dict[str, Any]],
    ) -> List[NetworkSegment]:
        """Segmenta dispositivos por nível de saúde."""
        categories = {
            HealthCategory.EXCELLENT: [],
            HealthCategory.GOOD: [],
            HealthCategory.FAIR: [],
            HealthCategory.POOR: [],
            HealthCategory.CRITICAL: [],
        }
        
        for device in devices:
            health_score = device.get("health_score", 50)
            device_id = device.get("device_id", "unknown")
            
            if health_score >= 90:
                categories[HealthCategory.EXCELLENT].append(device)
            elif health_score >= 70:
                categories[HealthCategory.GOOD].append(device)
            elif health_score >= 50:
                categories[HealthCategory.FAIR].append(device)
            elif health_score >= 30:
                categories[HealthCategory.POOR].append(device)
            else:
                categories[HealthCategory.CRITICAL].append(device)
        
        segments = []
        risk_levels = {
            HealthCategory.EXCELLENT: "minimal",
            HealthCategory.GOOD: "low",
            HealthCategory.FAIR: "medium",
            HealthCategory.POOR: "high",
            HealthCategory.CRITICAL: "critical",
        }
        
        for category, device_list in categories.items():
            if not device_list:
                continue
            
            device_ids = [d.get("device_id", "unknown") for d in device_list]
            avg_score = sum(d.get("health_score", 50) for d in device_list) / len(device_list)
            
            # Identificar problemas dominantes
            issues = self._identify_dominant_issues(device_list)
            
            segment = NetworkSegment(
                segment_id=f"health_{category.value}",
                device_ids=device_ids,
                characteristics={
                    "health_category": category.value,
                    "device_count": len(device_list),
                    "score_range": f"{category.value.upper()}",
                },
                avg_health_score=avg_score,
                risk_level=risk_levels[category],
                dominant_issues=issues,
            )
            
            segments.append(segment)
        
        return segments
    
    def _segment_by_behavior(
        self,
        devices: List[Dict[str, Any]],
    ) -> List[NetworkSegment]:
        """Segmenta dispositivos por padrão de comportamento."""
        # Categorias comportamentais
        stable_devices = []
        intermittent_devices = []
        degrading_devices = []
        improving_devices = []
        
        for device in devices:
            trend = device.get("trend", "stable")
            stability = device.get("stability_score", 100)
            
            if stability >= 80 and trend == "stable":
                stable_devices.append(device)
            elif stability < 50:
                intermittent_devices.append(device)
            elif trend == "decreasing":
                degrading_devices.append(device)
            elif trend == "increasing":
                improving_devices.append(device)
            else:
                stable_devices.append(device)
        
        segments = []
        
        behavior_configs = [
            ("stable", stable_devices, "minimal", ["Manter monitoramento padrão"]),
            ("intermittent", intermittent_devices, "high", ["Conexões instáveis", "Quedas frequentes"]),
            ("degrading", degrading_devices, "medium", ["Performance em declínio"]),
            ("improving", improving_devices, "low", ["Tendência de melhora"]),
        ]
        
        for name, device_list, risk, issues in behavior_configs:
            if not device_list:
                continue
            
            avg_score = sum(d.get("health_score", 50) for d in device_list) / len(device_list)
            
            segment = NetworkSegment(
                segment_id=f"behavior_{name}",
                device_ids=[d.get("device_id", "unknown") for d in device_list],
                characteristics={
                    "behavior_type": name,
                    "device_count": len(device_list),
                },
                avg_health_score=avg_score,
                risk_level=risk,
                dominant_issues=issues,
            )
            
            segments.append(segment)
        
        return segments
    
    def _identify_dominant_issues(
        self,
        devices: List[Dict[str, Any]],
    ) -> List[str]:
        """Identifica problemas mais comuns no grupo de dispositivos."""
        issue_counts = defaultdict(int)
        
        for device in devices:
            issues = device.get("issues", [])
            for issue in issues:
                issue_counts[issue] += 1
        
        if not issue_counts:
            return ["Sem problemas identificados"]
        
        # Top 3 problemas
        sorted_issues = sorted(issue_counts.items(), key=lambda x: x[1], reverse=True)
        return [issue for issue, count in sorted_issues[:3]]
    
    # ============ Saúde da Rede ============
    
    def calculate_network_health(
        self,
        devices: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """
        Calcula saúde geral da rede.
        
        Returns:
            Dict com score geral, distribuição e insights
        """
        if not devices:
            return {
                "overall_score": 0,
                "category": "unknown",
                "device_count": 0,
                "distribution": {},
                "insights": ["Nenhum dispositivo para análise"],
            }
        
        # Calcular score médio
        scores = [d.get("health_score", 50) for d in devices]
        avg_score = sum(scores) / len(scores)
        
        # Distribuição por categoria
        distribution = {
            "excellent": sum(1 for s in scores if s >= 90),
            "good": sum(1 for s in scores if 70 <= s < 90),
            "fair": sum(1 for s in scores if 50 <= s < 70),
            "poor": sum(1 for s in scores if 30 <= s < 50),
            "critical": sum(1 for s in scores if s < 30),
        }
        
        # Determinar categoria geral
        if avg_score >= 90:
            category = "excellent"
        elif avg_score >= 70:
            category = "good"
        elif avg_score >= 50:
            category = "fair"
        elif avg_score >= 30:
            category = "poor"
        else:
            category = "critical"
        
        # Gerar insights
        insights = []
        
        critical_pct = distribution["critical"] / len(devices) * 100
        if critical_pct > 5:
            insights.append(f"⚠️ {critical_pct:.1f}% dos dispositivos em estado crítico")
        
        healthy_pct = (distribution["excellent"] + distribution["good"]) / len(devices) * 100
        insights.append(f"✅ {healthy_pct:.1f}% dos dispositivos em bom estado")
        
        if distribution["poor"] > 0:
            insights.append(f"📊 {distribution['poor']} dispositivo(s) precisam de atenção")
        
        return {
            "overall_score": round(avg_score, 1),
            "category": category,
            "device_count": len(devices),
            "distribution": distribution,
            "insights": insights,
            "calculated_at": datetime.utcnow().isoformat(),
        }


# Instância global para uso no analytics_router
network_analyzer = NetworkAnalyzer()
