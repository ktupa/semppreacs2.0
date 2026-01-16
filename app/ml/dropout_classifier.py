# app/ml/dropout_classifier.py
"""
DropoutClassifier - Classificador de risco de queda de conexão.

Analisa padrões de conectividade, histórico de quedas e métricas
para prever probabilidade de desconexão.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass, field
import statistics
import math

log = logging.getLogger("semppre-bridge.ml.dropout")


@dataclass
class ConnectionEvent:
    """Representa um evento de conexão/desconexão."""
    timestamp: datetime
    event_type: str  # "connect", "disconnect", "timeout", "reboot"
    duration_seconds: Optional[int] = None  # duração do downtime
    cause: Optional[str] = None


@dataclass
class DropoutPrediction:
    """Resultado da classificação de dropout."""
    device_id: str
    dropout_probability: float  # 0.0 a 1.0
    risk_level: str  # "low", "medium", "high", "critical"
    predicted_window_hours: int
    
    # Fatores de risco
    risk_factors: Dict[str, float] = field(default_factory=dict)
    
    # Histórico
    total_dropouts_24h: int = 0
    total_dropouts_7d: int = 0
    avg_downtime_seconds: float = 0
    uptime_percentage: float = 100.0
    
    # Padrões detectados
    patterns: List[str] = field(default_factory=list)
    
    # Recomendações
    recommendations: List[str] = field(default_factory=list)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "device_id": self.device_id,
            "dropout_probability": round(self.dropout_probability, 3),
            "risk_level": self.risk_level,
            "predicted_window_hours": self.predicted_window_hours,
            "risk_factors": {k: round(v, 3) for k, v in self.risk_factors.items()},
            "history": {
                "total_dropouts_24h": self.total_dropouts_24h,
                "total_dropouts_7d": self.total_dropouts_7d,
                "avg_downtime_seconds": round(self.avg_downtime_seconds, 1),
                "uptime_percentage": round(self.uptime_percentage, 2),
            },
            "patterns": self.patterns,
            "recommendations": self.recommendations,
        }


class DropoutClassifier:
    """
    Classificador de risco de dropout (queda de conexão).
    
    Analisa:
    - Histórico de eventos de conexão/desconexão
    - Métricas de qualidade (latência, jitter, packet loss)
    - Padrões temporais (horários de pico, dias da semana)
    - Indicadores de hardware (reboots, uptime)
    """
    
    # Pesos dos fatores de risco
    RISK_WEIGHTS = {
        "recent_dropouts": 0.25,      # quedas recentes
        "dropout_frequency": 0.20,    # frequência de quedas
        "latency_quality": 0.15,      # qualidade de latência
        "packet_loss": 0.15,          # perda de pacotes
        "uptime_pattern": 0.10,       # padrão de uptime
        "reboot_frequency": 0.10,     # frequência de reboots
        "time_of_day": 0.05,          # horário do dia
    }
    
    # Thresholds
    RISK_THRESHOLDS = {
        "low": 0.2,
        "medium": 0.4,
        "high": 0.6,
        "critical": 0.8,
    }
    
    def __init__(self):
        self.weights = self.RISK_WEIGHTS.copy()
    
    def classify(
        self,
        device_id: str,
        connection_events: List[ConnectionEvent],
        latency_samples: Optional[List[Tuple[datetime, float]]] = None,
        packet_loss_samples: Optional[List[Tuple[datetime, float]]] = None,
        uptime_seconds: Optional[int] = None,
        prediction_window_hours: int = 24,
    ) -> DropoutPrediction:
        """
        Classifica risco de dropout para um dispositivo.
        
        Args:
            device_id: ID do dispositivo
            connection_events: Lista de eventos de conexão
            latency_samples: Amostras de latência (timestamp, ms)
            packet_loss_samples: Amostras de packet loss (timestamp, %)
            uptime_seconds: Tempo de atividade atual
            prediction_window_hours: Janela de predição
            
        Returns:
            DropoutPrediction com classificação
        """
        now = datetime.utcnow()
        risk_factors = {}
        patterns = []
        recommendations = []
        
        # Filtrar eventos por período
        events_24h = [e for e in connection_events if (now - e.timestamp).total_seconds() < 86400]
        events_7d = [e for e in connection_events if (now - e.timestamp).total_seconds() < 604800]
        
        # Contar dropouts
        dropouts_24h = len([e for e in events_24h if e.event_type in ("disconnect", "timeout")])
        dropouts_7d = len([e for e in events_7d if e.event_type in ("disconnect", "timeout")])
        
        # Calcular downtime médio
        downtimes = [e.duration_seconds for e in connection_events if e.duration_seconds and e.duration_seconds > 0]
        avg_downtime = statistics.mean(downtimes) if downtimes else 0
        
        # 1. Fator: Quedas recentes (últimas 24h)
        risk_factors["recent_dropouts"] = min(1.0, dropouts_24h / 5)  # 5+ quedas = 100%
        
        if dropouts_24h >= 5:
            patterns.append("Alto número de quedas nas últimas 24h")
            recommendations.append("Verificar estabilidade da linha física")
        elif dropouts_24h >= 2:
            patterns.append("Múltiplas quedas detectadas nas últimas 24h")
        
        # 2. Fator: Frequência de quedas (7 dias)
        daily_rate = dropouts_7d / 7
        risk_factors["dropout_frequency"] = min(1.0, daily_rate / 3)  # 3+/dia = 100%
        
        if daily_rate >= 2:
            patterns.append(f"Padrão de {daily_rate:.1f} quedas por dia")
            recommendations.append("Considerar troca de equipamento ou verificação de infraestrutura")
        
        # 3. Fator: Qualidade de latência
        if latency_samples:
            latencies = [s[1] for s in latency_samples]
            avg_latency = statistics.mean(latencies)
            if avg_latency > 200:
                risk_factors["latency_quality"] = 0.8
                patterns.append("Latência elevada pode indicar problemas de conectividade")
            elif avg_latency > 100:
                risk_factors["latency_quality"] = 0.5
            elif avg_latency > 50:
                risk_factors["latency_quality"] = 0.2
            else:
                risk_factors["latency_quality"] = 0.0
        else:
            risk_factors["latency_quality"] = 0.3  # sem dados = risco médio-baixo
        
        # 4. Fator: Perda de pacotes
        if packet_loss_samples:
            losses = [s[1] for s in packet_loss_samples]
            avg_loss = statistics.mean(losses)
            if avg_loss > 5:
                risk_factors["packet_loss"] = 0.9
                patterns.append(f"Perda de pacotes alta ({avg_loss:.1f}%)")
                recommendations.append("Verificar qualidade do link WAN")
            elif avg_loss > 2:
                risk_factors["packet_loss"] = 0.5
                patterns.append(f"Perda de pacotes moderada ({avg_loss:.1f}%)")
            elif avg_loss > 0.5:
                risk_factors["packet_loss"] = 0.2
            else:
                risk_factors["packet_loss"] = 0.0
        else:
            risk_factors["packet_loss"] = 0.2
        
        # 5. Fator: Padrão de uptime
        if uptime_seconds is not None:
            uptime_hours = uptime_seconds / 3600
            if uptime_hours < 1:
                risk_factors["uptime_pattern"] = 0.9  # reiniciou recentemente
                patterns.append("Reinício recente detectado")
            elif uptime_hours < 24:
                risk_factors["uptime_pattern"] = 0.4
            elif uptime_hours < 168:  # 7 dias
                risk_factors["uptime_pattern"] = 0.1
            else:
                risk_factors["uptime_pattern"] = 0.0  # uptime estável
        else:
            risk_factors["uptime_pattern"] = 0.3
        
        # 6. Fator: Frequência de reboots
        reboots = [e for e in events_7d if e.event_type == "reboot"]
        reboot_count = len(reboots)
        risk_factors["reboot_frequency"] = min(1.0, reboot_count / 10)  # 10+ = 100%
        
        if reboot_count >= 5:
            patterns.append(f"{reboot_count} reboots nos últimos 7 dias")
            recommendations.append("Investigar causa dos reinícios frequentes")
        
        # 7. Fator: Horário do dia (picos noturnos são mais críticos)
        hour = now.hour
        if 19 <= hour <= 23:  # horário de pico
            risk_factors["time_of_day"] = 0.3
        elif 0 <= hour <= 6:  # madrugada
            risk_factors["time_of_day"] = 0.1
        else:
            risk_factors["time_of_day"] = 0.2
        
        # Calcular probabilidade ponderada
        dropout_probability = sum(
            risk_factors.get(factor, 0) * weight
            for factor, weight in self.weights.items()
        )
        
        # Ajustar para não ultrapassar 1.0
        dropout_probability = min(1.0, dropout_probability)
        
        # Classificar nível de risco
        risk_level = self._classify_risk_level(dropout_probability)
        
        # Calcular uptime percentage
        if dropouts_7d > 0 and avg_downtime > 0:
            total_downtime = dropouts_7d * avg_downtime
            uptime_pct = max(0, 100 - (total_downtime / 604800 * 100))
        else:
            uptime_pct = 100.0
        
        # Adicionar recomendações gerais baseadas no risco
        if risk_level == "critical":
            recommendations.insert(0, "⚠️ Risco crítico: intervenção imediata recomendada")
        elif risk_level == "high":
            recommendations.insert(0, "Monitoramento intensivo recomendado")
        
        return DropoutPrediction(
            device_id=device_id,
            dropout_probability=dropout_probability,
            risk_level=risk_level,
            predicted_window_hours=prediction_window_hours,
            risk_factors=risk_factors,
            total_dropouts_24h=dropouts_24h,
            total_dropouts_7d=dropouts_7d,
            avg_downtime_seconds=avg_downtime,
            uptime_percentage=uptime_pct,
            patterns=patterns,
            recommendations=recommendations,
        )
    
    def _classify_risk_level(self, probability: float) -> str:
        """Classifica nível de risco baseado na probabilidade."""
        if probability >= self.RISK_THRESHOLDS["critical"]:
            return "critical"
        elif probability >= self.RISK_THRESHOLDS["high"]:
            return "high"
        elif probability >= self.RISK_THRESHOLDS["medium"]:
            return "medium"
        else:
            return "low"
    
    def analyze_patterns(
        self, connection_events: List[ConnectionEvent]
    ) -> Dict[str, Any]:
        """
        Analisa padrões temporais nos eventos de conexão.
        
        Returns:
            Dict com análise de padrões
        """
        if not connection_events:
            return {"patterns": [], "peak_hours": [], "peak_days": []}
        
        disconnects = [e for e in connection_events if e.event_type in ("disconnect", "timeout")]
        
        if not disconnects:
            return {"patterns": [], "peak_hours": [], "peak_days": []}
        
        # Análise por hora
        hour_counts = {}
        for event in disconnects:
            hour = event.timestamp.hour
            hour_counts[hour] = hour_counts.get(hour, 0) + 1
        
        # Encontrar horários de pico
        if hour_counts:
            avg_per_hour = sum(hour_counts.values()) / 24
            peak_hours = [h for h, c in hour_counts.items() if c > avg_per_hour * 1.5]
        else:
            peak_hours = []
        
        # Análise por dia da semana
        day_counts = {}
        day_names = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sab", "Dom"]
        for event in disconnects:
            day = event.timestamp.weekday()
            day_counts[day] = day_counts.get(day, 0) + 1
        
        # Encontrar dias de pico
        if day_counts:
            avg_per_day = sum(day_counts.values()) / 7
            peak_days = [day_names[d] for d, c in day_counts.items() if c > avg_per_day * 1.5]
        else:
            peak_days = []
        
        patterns = []
        
        if peak_hours:
            if any(19 <= h <= 23 for h in peak_hours):
                patterns.append("Quedas concentradas no horário noturno (19h-23h)")
            if any(8 <= h <= 12 for h in peak_hours):
                patterns.append("Quedas concentradas no período da manhã")
        
        if peak_days:
            patterns.append(f"Maior incidência nos dias: {', '.join(peak_days)}")
        
        return {
            "patterns": patterns,
            "peak_hours": peak_hours,
            "peak_days": peak_days,
            "hourly_distribution": hour_counts,
            "daily_distribution": {day_names[k]: v for k, v in day_counts.items()},
        }
    
    def get_stability_score(
        self, connection_events: List[ConnectionEvent]
    ) -> Dict[str, Any]:
        """
        Calcula score de estabilidade de conexão (0-100).
        
        Returns:
            Dict com score e detalhes
        """
        if not connection_events:
            return {
                "score": 100,
                "status": "unknown",
                "message": "Sem dados de eventos",
            }
        
        now = datetime.utcnow()
        events_7d = [e for e in connection_events if (now - e.timestamp).total_seconds() < 604800]
        
        # Contar eventos negativos
        disconnects = len([e for e in events_7d if e.event_type in ("disconnect", "timeout")])
        reboots = len([e for e in events_7d if e.event_type == "reboot"])
        
        # Calcular downtime total
        downtimes = [e.duration_seconds for e in events_7d if e.duration_seconds]
        total_downtime = sum(downtimes)
        
        # Score inicial de 100
        score = 100.0
        
        # Penalidade por desconexões (-5 por desconexão, max -40)
        score -= min(40, disconnects * 5)
        
        # Penalidade por reboots (-3 por reboot, max -20)
        score -= min(20, reboots * 3)
        
        # Penalidade por downtime (-1 por 10 minutos de downtime, max -30)
        downtime_minutes = total_downtime / 60
        score -= min(30, downtime_minutes / 10)
        
        # Ajustar para não ficar negativo
        score = max(0, score)
        
        # Classificar status
        if score >= 90:
            status = "excellent"
            message = "Conexão muito estável"
        elif score >= 70:
            status = "good"
            message = "Conexão estável com pequenas interrupções"
        elif score >= 50:
            status = "fair"
            message = "Estabilidade moderada, requer atenção"
        elif score >= 30:
            status = "poor"
            message = "Conexão instável, investigação necessária"
        else:
            status = "critical"
            message = "Conexão muito instável, ação urgente"
        
        return {
            "score": round(score, 1),
            "status": status,
            "message": message,
            "details": {
                "disconnects_7d": disconnects,
                "reboots_7d": reboots,
                "total_downtime_minutes": round(downtime_minutes, 1),
            },
        }
