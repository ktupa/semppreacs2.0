# app/ml/wifi_quality_scorer.py
"""
WifiQualityScorer - Modelo de pontuação de qualidade WiFi.

Analisa múltiplos fatores para gerar um score de qualidade WiFi
e recomendações de otimização.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass, field
import statistics

log = logging.getLogger("semppre-bridge.ml.wifi")


@dataclass
class WifiMetrics:
    """Métricas WiFi de um dispositivo."""
    # Configuração
    ssid_24ghz: Optional[str] = None
    ssid_5ghz: Optional[str] = None
    channel_24ghz: Optional[int] = None
    channel_5ghz: Optional[int] = None
    bandwidth_24ghz: Optional[str] = None  # "20MHz", "40MHz"
    bandwidth_5ghz: Optional[str] = None   # "20MHz", "40MHz", "80MHz"
    security_mode: Optional[str] = None    # "WPA2-PSK", "WPA3"
    
    # Performance
    clients_24ghz: int = 0
    clients_5ghz: int = 0
    noise_24ghz: Optional[int] = None  # dBm (negativo)
    noise_5ghz: Optional[int] = None   # dBm (negativo)
    
    # Histórico de clientes
    client_rssi_values: List[int] = field(default_factory=list)  # dBm
    client_tx_rates: List[int] = field(default_factory=list)     # Mbps


@dataclass
class WifiQualityReport:
    """Relatório de qualidade WiFi."""
    device_id: str
    overall_score: float  # 0-100
    status: str  # "excellent", "good", "fair", "poor", "critical"
    
    # Scores parciais
    scores: Dict[str, float] = field(default_factory=dict)
    
    # Problemas detectados
    issues: List[Dict[str, Any]] = field(default_factory=list)
    
    # Recomendações
    recommendations: List[str] = field(default_factory=list)
    
    # Detalhes
    band_analysis: Dict[str, Any] = field(default_factory=dict)
    
    # Timestamp
    analyzed_at: datetime = field(default_factory=datetime.utcnow)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "device_id": self.device_id,
            "overall_score": round(self.overall_score, 1),
            "status": self.status,
            "scores": {k: round(v, 1) for k, v in self.scores.items()},
            "issues": self.issues,
            "recommendations": self.recommendations,
            "band_analysis": self.band_analysis,
            "analyzed_at": self.analyzed_at.isoformat(),
        }


class WifiQualityScorer:
    """
    Avaliador de qualidade WiFi para dispositivos CPE.
    
    Analisa:
    - Configuração de canais (interferência, DFS)
    - Número de clientes vs capacidade
    - RSSI e taxa de transmissão dos clientes
    - Segurança (WPA2/WPA3)
    - Bandwidth e otimizações
    """
    
    # Canais recomendados 2.4GHz (não sobrepostos)
    RECOMMENDED_CHANNELS_24GHZ = [1, 6, 11]
    
    # Canais DFS 5GHz (requerem radar detection)
    DFS_CHANNELS_5GHZ = list(range(52, 65)) + list(range(100, 145))
    
    # Thresholds de RSSI
    RSSI_THRESHOLDS = {
        "excellent": -50,
        "good": -60,
        "fair": -70,
        "poor": -80,
    }
    
    # Máximo de clientes recomendado por banda
    MAX_CLIENTS_24GHZ = 15
    MAX_CLIENTS_5GHZ = 30
    
    def __init__(self):
        pass
    
    def analyze(
        self,
        device_id: str,
        metrics: WifiMetrics,
    ) -> WifiQualityReport:
        """
        Analisa qualidade WiFi e gera relatório.
        
        Args:
            device_id: ID do dispositivo
            metrics: Métricas WiFi coletadas
            
        Returns:
            WifiQualityReport com análise completa
        """
        scores = {}
        issues = []
        recommendations = []
        band_analysis = {}
        
        # 1. Análise de canal 2.4GHz
        score_24, issues_24, recs_24 = self._analyze_24ghz(metrics)
        scores["channel_24ghz"] = score_24
        issues.extend(issues_24)
        recommendations.extend(recs_24)
        band_analysis["2.4GHz"] = {
            "channel": metrics.channel_24ghz,
            "clients": metrics.clients_24ghz,
            "noise": metrics.noise_24ghz,
            "score": score_24,
        }
        
        # 2. Análise de canal 5GHz
        score_5, issues_5, recs_5 = self._analyze_5ghz(metrics)
        scores["channel_5ghz"] = score_5
        issues.extend(issues_5)
        recommendations.extend(recs_5)
        band_analysis["5GHz"] = {
            "channel": metrics.channel_5ghz,
            "clients": metrics.clients_5ghz,
            "noise": metrics.noise_5ghz,
            "score": score_5,
        }
        
        # 3. Análise de clientes
        score_clients, issues_clients, recs_clients = self._analyze_clients(metrics)
        scores["client_distribution"] = score_clients
        issues.extend(issues_clients)
        recommendations.extend(recs_clients)
        
        # 4. Análise de RSSI
        score_rssi, issues_rssi, recs_rssi = self._analyze_rssi(metrics)
        scores["signal_quality"] = score_rssi
        issues.extend(issues_rssi)
        recommendations.extend(recs_rssi)
        
        # 5. Análise de segurança
        score_security, issues_security, recs_security = self._analyze_security(metrics)
        scores["security"] = score_security
        issues.extend(issues_security)
        recommendations.extend(recs_security)
        
        # 6. Análise de bandwidth
        score_bw, issues_bw, recs_bw = self._analyze_bandwidth(metrics)
        scores["bandwidth_config"] = score_bw
        issues.extend(issues_bw)
        recommendations.extend(recs_bw)
        
        # Calcular score geral (média ponderada)
        weights = {
            "channel_24ghz": 0.15,
            "channel_5ghz": 0.20,
            "client_distribution": 0.20,
            "signal_quality": 0.25,
            "security": 0.10,
            "bandwidth_config": 0.10,
        }
        
        overall_score = sum(
            scores.get(k, 50) * w
            for k, w in weights.items()
        )
        
        # Determinar status
        status = self._classify_status(overall_score)
        
        # Priorizar recomendações
        recommendations = self._prioritize_recommendations(recommendations, issues)
        
        return WifiQualityReport(
            device_id=device_id,
            overall_score=overall_score,
            status=status,
            scores=scores,
            issues=issues,
            recommendations=recommendations[:10],  # Limitar a 10 recomendações
            band_analysis=band_analysis,
        )
    
    def _analyze_24ghz(
        self, metrics: WifiMetrics
    ) -> Tuple[float, List[Dict], List[str]]:
        """Analisa configuração 2.4GHz."""
        score = 100.0
        issues = []
        recs = []
        
        if metrics.channel_24ghz is None:
            return (50, [], ["Verificar configuração do canal 2.4GHz"])
        
        # Verificar canal recomendado
        if metrics.channel_24ghz not in self.RECOMMENDED_CHANNELS_24GHZ:
            score -= 20
            issues.append({
                "severity": "medium",
                "category": "channel_24ghz",
                "message": f"Canal {metrics.channel_24ghz} não é recomendado",
                "current": metrics.channel_24ghz,
                "recommended": self.RECOMMENDED_CHANNELS_24GHZ,
            })
            recs.append(f"Alterar canal 2.4GHz para 1, 6 ou 11 (atualmente: {metrics.channel_24ghz})")
        
        # Verificar ruído
        if metrics.noise_24ghz is not None:
            if metrics.noise_24ghz > -80:
                score -= 15
                issues.append({
                    "severity": "high",
                    "category": "noise_24ghz",
                    "message": f"Alto nível de ruído: {metrics.noise_24ghz} dBm",
                })
                recs.append("Ambiente com interferência elevada em 2.4GHz, considerar uso de 5GHz")
            elif metrics.noise_24ghz > -85:
                score -= 5
        
        # Verificar sobrecarga de clientes
        if metrics.clients_24ghz > self.MAX_CLIENTS_24GHZ:
            score -= 20
            issues.append({
                "severity": "medium",
                "category": "clients_24ghz",
                "message": f"Muitos clientes em 2.4GHz: {metrics.clients_24ghz}",
            })
            recs.append(f"Migrar alguns dispositivos para 5GHz (2.4GHz: {metrics.clients_24ghz} clientes)")
        
        return (max(0, score), issues, recs)
    
    def _analyze_5ghz(
        self, metrics: WifiMetrics
    ) -> Tuple[float, List[Dict], List[str]]:
        """Analisa configuração 5GHz."""
        score = 100.0
        issues = []
        recs = []
        
        if metrics.channel_5ghz is None:
            # 5GHz pode não estar configurado
            return (70, [], ["Considerar habilitar banda 5GHz para melhor performance"])
        
        # Verificar canal DFS
        if metrics.channel_5ghz in self.DFS_CHANNELS_5GHZ:
            score -= 10
            issues.append({
                "severity": "low",
                "category": "channel_5ghz",
                "message": f"Canal {metrics.channel_5ghz} requer DFS (pode ter interrupções)",
            })
        
        # Verificar ruído
        if metrics.noise_5ghz is not None and metrics.noise_5ghz > -75:
            score -= 15
            issues.append({
                "severity": "high",
                "category": "noise_5ghz",
                "message": f"Ruído elevado em 5GHz: {metrics.noise_5ghz} dBm",
            })
        
        # Verificar sobrecarga
        if metrics.clients_5ghz > self.MAX_CLIENTS_5GHZ:
            score -= 15
            issues.append({
                "severity": "medium",
                "category": "clients_5ghz",
                "message": f"Muitos clientes em 5GHz: {metrics.clients_5ghz}",
            })
        
        return (max(0, score), issues, recs)
    
    def _analyze_clients(
        self, metrics: WifiMetrics
    ) -> Tuple[float, List[Dict], List[str]]:
        """Analisa distribuição de clientes."""
        score = 100.0
        issues = []
        recs = []
        
        total_clients = metrics.clients_24ghz + metrics.clients_5ghz
        
        if total_clients == 0:
            return (80, [], [])  # Sem clientes não é necessariamente ruim
        
        # Verificar distribuição entre bandas
        if metrics.channel_5ghz is not None and total_clients > 5:
            ratio_24 = metrics.clients_24ghz / total_clients
            
            if ratio_24 > 0.8:
                score -= 20
                issues.append({
                    "severity": "medium",
                    "category": "band_distribution",
                    "message": f"Maioria dos clientes em 2.4GHz ({metrics.clients_24ghz}/{total_clients})",
                })
                recs.append("Habilitar Band Steering para distribuir clientes automaticamente")
        
        # Total de clientes
        if total_clients > 40:
            score -= 30
            issues.append({
                "severity": "high",
                "category": "total_clients",
                "message": f"Número muito alto de clientes: {total_clients}",
            })
            recs.append("Considerar Access Point adicional para distribuir carga")
        elif total_clients > 25:
            score -= 15
        
        return (max(0, score), issues, recs)
    
    def _analyze_rssi(
        self, metrics: WifiMetrics
    ) -> Tuple[float, List[Dict], List[str]]:
        """Analisa qualidade de sinal dos clientes."""
        score = 100.0
        issues = []
        recs = []
        
        if not metrics.client_rssi_values:
            return (70, [], [])  # Sem dados de RSSI
        
        avg_rssi = statistics.mean(metrics.client_rssi_values)
        min_rssi = min(metrics.client_rssi_values)
        
        # Score baseado em RSSI médio
        if avg_rssi >= self.RSSI_THRESHOLDS["excellent"]:
            pass  # Excelente
        elif avg_rssi >= self.RSSI_THRESHOLDS["good"]:
            score -= 10
        elif avg_rssi >= self.RSSI_THRESHOLDS["fair"]:
            score -= 25
            issues.append({
                "severity": "medium",
                "category": "rssi",
                "message": f"RSSI médio moderado: {avg_rssi} dBm",
            })
        else:
            score -= 40
            issues.append({
                "severity": "high",
                "category": "rssi",
                "message": f"RSSI médio fraco: {avg_rssi} dBm",
            })
            recs.append("Clientes com sinal fraco, verificar posicionamento do roteador")
        
        # Verificar clientes com sinal muito fraco
        weak_clients = sum(1 for r in metrics.client_rssi_values if r < -75)
        if weak_clients > 0:
            weak_pct = (weak_clients / len(metrics.client_rssi_values)) * 100
            if weak_pct > 30:
                score -= 15
                issues.append({
                    "severity": "medium",
                    "category": "weak_clients",
                    "message": f"{weak_pct:.0f}% dos clientes com sinal fraco",
                })
                recs.append("Considerar repetidor ou mesh para áreas com sinal fraco")
        
        # Verificar taxa de transmissão
        if metrics.client_tx_rates:
            avg_tx = statistics.mean(metrics.client_tx_rates)
            if avg_tx < 50:
                score -= 15
                issues.append({
                    "severity": "medium",
                    "category": "tx_rate",
                    "message": f"Taxa de transmissão média baixa: {avg_tx} Mbps",
                })
        
        return (max(0, score), issues, recs)
    
    def _analyze_security(
        self, metrics: WifiMetrics
    ) -> Tuple[float, List[Dict], List[str]]:
        """Analisa configuração de segurança."""
        score = 100.0
        issues = []
        recs = []
        
        if not metrics.security_mode:
            return (50, [{"severity": "high", "category": "security", "message": "Modo de segurança desconhecido"}], [])
        
        security = metrics.security_mode.upper()
        
        if "WPA3" in security:
            pass  # Excelente
        elif "WPA2" in security:
            score -= 5  # Bom, mas WPA3 é melhor
        elif "WPA" in security and "WPA2" not in security:
            score -= 40
            issues.append({
                "severity": "high",
                "category": "security",
                "message": "WPA1 está obsoleto e inseguro",
            })
            recs.append("Atualizar para WPA2-PSK ou WPA3 imediatamente")
        elif "WEP" in security:
            score -= 60
            issues.append({
                "severity": "critical",
                "category": "security",
                "message": "WEP é extremamente vulnerável",
            })
            recs.append("⚠️ URGENTE: Migrar de WEP para WPA2/WPA3")
        elif "OPEN" in security or "NONE" in security:
            score -= 80
            issues.append({
                "severity": "critical",
                "category": "security",
                "message": "Rede sem criptografia!",
            })
            recs.append("⚠️ CRÍTICO: Habilitar WPA2-PSK ou WPA3")
        
        return (max(0, score), issues, recs)
    
    def _analyze_bandwidth(
        self, metrics: WifiMetrics
    ) -> Tuple[float, List[Dict], List[str]]:
        """Analisa configuração de bandwidth."""
        score = 100.0
        issues = []
        recs = []
        
        # 2.4GHz bandwidth
        if metrics.bandwidth_24ghz:
            if "40" in metrics.bandwidth_24ghz:
                # 40MHz em 2.4GHz pode causar mais interferência
                if metrics.noise_24ghz and metrics.noise_24ghz > -80:
                    score -= 10
                    recs.append("Considerar 20MHz em 2.4GHz em ambiente com interferência")
        
        # 5GHz bandwidth
        if metrics.bandwidth_5ghz:
            if "20" in metrics.bandwidth_5ghz:
                score -= 15
                issues.append({
                    "severity": "low",
                    "category": "bandwidth_5ghz",
                    "message": "5GHz limitado a 20MHz",
                })
                recs.append("Aumentar bandwidth 5GHz para 40MHz ou 80MHz para melhor throughput")
            elif "80" in metrics.bandwidth_5ghz or "160" in metrics.bandwidth_5ghz:
                pass  # Ótimo
        
        return (max(0, score), issues, recs)
    
    def _classify_status(self, score: float) -> str:
        """Classifica status baseado no score."""
        if score >= 85:
            return "excellent"
        elif score >= 70:
            return "good"
        elif score >= 50:
            return "fair"
        elif score >= 30:
            return "poor"
        else:
            return "critical"
    
    def _prioritize_recommendations(
        self, recommendations: List[str], issues: List[Dict]
    ) -> List[str]:
        """Prioriza recomendações por severidade."""
        # Separar críticas (começam com ⚠️)
        critical = [r for r in recommendations if r.startswith("⚠️")]
        normal = [r for r in recommendations if not r.startswith("⚠️")]
        
        # Remover duplicatas mantendo ordem
        seen = set()
        unique = []
        for r in critical + normal:
            if r not in seen:
                seen.add(r)
                unique.append(r)
        
        return unique
    
    def get_optimization_suggestions(
        self,
        device_id: str,
        metrics: WifiMetrics,
        neighbor_channels: Optional[List[int]] = None,
    ) -> Dict[str, Any]:
        """
        Gera sugestões de otimização WiFi.
        
        Args:
            device_id: ID do dispositivo
            metrics: Métricas atuais
            neighbor_channels: Canais usados por redes vizinhas
            
        Returns:
            Dict com sugestões de otimização
        """
        suggestions = {
            "device_id": device_id,
            "channel_24ghz": None,
            "channel_5ghz": None,
            "bandwidth_5ghz": None,
            "band_steering": None,
            "explanations": [],
        }
        
        # Sugestão de canal 2.4GHz
        if metrics.channel_24ghz and metrics.channel_24ghz not in self.RECOMMENDED_CHANNELS_24GHZ:
            # Escolher melhor canal
            if neighbor_channels:
                free_channels = [c for c in self.RECOMMENDED_CHANNELS_24GHZ if c not in neighbor_channels]
                suggestions["channel_24ghz"] = free_channels[0] if free_channels else 6
            else:
                suggestions["channel_24ghz"] = 6  # Canal mais comum
            suggestions["explanations"].append(
                f"Mudar canal 2.4GHz de {metrics.channel_24ghz} para {suggestions['channel_24ghz']}"
            )
        
        # Sugestão de bandwidth 5GHz
        if metrics.bandwidth_5ghz and "20" in metrics.bandwidth_5ghz:
            suggestions["bandwidth_5ghz"] = "80MHz"
            suggestions["explanations"].append(
                "Aumentar bandwidth 5GHz para 80MHz para melhor performance"
            )
        
        # Sugestão de band steering
        total_clients = metrics.clients_24ghz + metrics.clients_5ghz
        if total_clients > 5 and metrics.clients_24ghz > metrics.clients_5ghz * 2:
            suggestions["band_steering"] = "enabled"
            suggestions["explanations"].append(
                "Habilitar Band Steering para balancear clientes entre bandas"
            )
        
        return suggestions
