# app/services/ml_service.py
# Serviço de Machine Learning para análise preditiva e detecção de anomalias

import numpy as np
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from collections import defaultdict
import logging
import json

from app.database.models import Device, DeviceMetric, DiagnosticLog, AlertEvent

log = logging.getLogger("semppre-bridge.ml")


class MLService:
    """
    Serviço de Machine Learning para:
    - Detecção de anomalias
    - Previsão de falhas
    - Análise de tendências
    - Recomendações automáticas
    """
    
    def __init__(self, db: Session):
        self.db = db
        
        # Thresholds configuráveis
        self.thresholds = {
            "latency_warning": 50,      # ms
            "latency_critical": 100,    # ms
            "packet_loss_warning": 1,   # %
            "packet_loss_critical": 5,  # %
            "cpu_warning": 80,          # %
            "cpu_critical": 95,         # %
            "memory_warning": 85,       # %
            "memory_critical": 95,      # %
            "wifi_clients_warning": 20, # clientes
            "anomaly_zscore": 2.5,      # desvios padrão
            "offline_minutes": 15,      # minutos sem inform
        }
    
    # ============ Análise Estatística ============
    
    def calculate_stats(self, values: List[float]) -> Dict[str, float]:
        """Calcula estatísticas básicas de uma série."""
        if not values:
            return {"mean": 0, "std": 0, "min": 0, "max": 0, "median": 0}
        
        arr = np.array([v for v in values if v is not None])
        if len(arr) == 0:
            return {"mean": 0, "std": 0, "min": 0, "max": 0, "median": 0}
        
        return {
            "mean": float(np.mean(arr)),
            "std": float(np.std(arr)),
            "min": float(np.min(arr)),
            "max": float(np.max(arr)),
            "median": float(np.median(arr)),
            "p95": float(np.percentile(arr, 95)) if len(arr) > 1 else float(arr[0]),
            "p99": float(np.percentile(arr, 99)) if len(arr) > 1 else float(arr[0]),
        }
    
    def calculate_zscore(self, value: float, mean: float, std: float) -> float:
        """Calcula Z-score para detecção de anomalias."""
        if std == 0:
            return 0
        return (value - mean) / std
    
    def detect_trend(self, values: List[float]) -> str:
        """Detecta tendência em uma série temporal."""
        if len(values) < 3:
            return "stable"
        
        # Calcular média móvel
        arr = np.array(values)
        first_half = np.mean(arr[:len(arr)//2])
        second_half = np.mean(arr[len(arr)//2:])
        
        diff_pct = ((second_half - first_half) / first_half * 100) if first_half != 0 else 0
        
        if diff_pct > 15:
            return "increasing"
        elif diff_pct < -15:
            return "decreasing"
        else:
            return "stable"
    
    # ============ Detecção de Anomalias ============
    
    def detect_anomalies(
        self,
        device_id: str,
        hours: int = 24
    ) -> Dict[str, Any]:
        """
        Detecta anomalias em métricas de um dispositivo.
        Retorna lista de anomalias detectadas com severidade.
        """
        device = self.db.query(Device).filter(Device.device_id == device_id).first()
        if not device:
            return {"device_id": device_id, "anomalies": [], "score": 0}
        
        since = datetime.utcnow() - timedelta(hours=hours)
        metrics = self.db.query(DeviceMetric)\
            .filter(DeviceMetric.device_id == device.id)\
            .filter(DeviceMetric.collected_at >= since)\
            .order_by(DeviceMetric.collected_at)\
            .all()
        
        if len(metrics) < 5:
            return {"device_id": device_id, "anomalies": [], "score": 0, "message": "Dados insuficientes"}
        
        anomalies = []
        
        # Analisar latência
        latencies = [m.ping_latency_ms for m in metrics if m.ping_latency_ms]
        if latencies:
            stats = self.calculate_stats(latencies)
            last_latency = latencies[-1] if latencies else 0
            
            if last_latency > self.thresholds["latency_critical"]:
                anomalies.append({
                    "metric": "ping_latency_ms",
                    "value": last_latency,
                    "threshold": self.thresholds["latency_critical"],
                    "severity": "critical",
                    "message": f"Latência crítica: {last_latency:.1f}ms"
                })
            elif last_latency > self.thresholds["latency_warning"]:
                anomalies.append({
                    "metric": "ping_latency_ms",
                    "value": last_latency,
                    "threshold": self.thresholds["latency_warning"],
                    "severity": "warning",
                    "message": f"Latência elevada: {last_latency:.1f}ms"
                })
            
            # Z-score para detectar spike
            if stats["std"] > 0:
                zscore = self.calculate_zscore(last_latency, stats["mean"], stats["std"])
                if abs(zscore) > self.thresholds["anomaly_zscore"]:
                    anomalies.append({
                        "metric": "ping_latency_ms",
                        "value": last_latency,
                        "zscore": round(zscore, 2),
                        "severity": "warning",
                        "message": f"Spike de latência detectado (Z={zscore:.2f})"
                    })
        
        # Analisar packet loss
        packet_losses = [m.ping_packet_loss for m in metrics if m.ping_packet_loss is not None]
        if packet_losses:
            last_pl = packet_losses[-1]
            if last_pl > self.thresholds["packet_loss_critical"]:
                anomalies.append({
                    "metric": "ping_packet_loss",
                    "value": last_pl,
                    "threshold": self.thresholds["packet_loss_critical"],
                    "severity": "critical",
                    "message": f"Perda de pacotes crítica: {last_pl:.1f}%"
                })
            elif last_pl > self.thresholds["packet_loss_warning"]:
                anomalies.append({
                    "metric": "ping_packet_loss",
                    "value": last_pl,
                    "threshold": self.thresholds["packet_loss_warning"],
                    "severity": "warning",
                    "message": f"Perda de pacotes elevada: {last_pl:.1f}%"
                })
        
        # Analisar CPU
        cpus = [m.cpu_usage for m in metrics if m.cpu_usage is not None]
        if cpus:
            last_cpu = cpus[-1]
            if last_cpu > self.thresholds["cpu_critical"]:
                anomalies.append({
                    "metric": "cpu_usage",
                    "value": last_cpu,
                    "threshold": self.thresholds["cpu_critical"],
                    "severity": "critical",
                    "message": f"CPU crítica: {last_cpu:.1f}%"
                })
            elif last_cpu > self.thresholds["cpu_warning"]:
                anomalies.append({
                    "metric": "cpu_usage",
                    "value": last_cpu,
                    "threshold": self.thresholds["cpu_warning"],
                    "severity": "warning",
                    "message": f"CPU elevada: {last_cpu:.1f}%"
                })
        
        # Analisar memória
        mems = [m.memory_usage for m in metrics if m.memory_usage is not None]
        if mems:
            last_mem = mems[-1]
            if last_mem > self.thresholds["memory_critical"]:
                anomalies.append({
                    "metric": "memory_usage",
                    "value": last_mem,
                    "threshold": self.thresholds["memory_critical"],
                    "severity": "critical",
                    "message": f"Memória crítica: {last_mem:.1f}%"
                })
            elif last_mem > self.thresholds["memory_warning"]:
                anomalies.append({
                    "metric": "memory_usage",
                    "value": last_mem,
                    "threshold": self.thresholds["memory_warning"],
                    "severity": "warning",
                    "message": f"Memória elevada: {last_mem:.1f}%"
                })
        
        # Analisar clientes WiFi (possível sobrecarga)
        wifi_clients = [(m.wifi_clients_24ghz or 0) + (m.wifi_clients_5ghz or 0) for m in metrics]
        if wifi_clients:
            last_clients = wifi_clients[-1]
            if last_clients > self.thresholds["wifi_clients_warning"]:
                anomalies.append({
                    "metric": "wifi_clients",
                    "value": last_clients,
                    "threshold": self.thresholds["wifi_clients_warning"],
                    "severity": "warning",
                    "message": f"Muitos clientes WiFi: {last_clients}"
                })
        
        # Calcular score de saúde (0-100)
        health_score = 100
        for anomaly in anomalies:
            if anomaly["severity"] == "critical":
                health_score -= 25
            elif anomaly["severity"] == "warning":
                health_score -= 10
        
        health_score = max(0, health_score)
        
        return {
            "device_id": device_id,
            "anomalies": anomalies,
            "health_score": health_score,
            "samples_analyzed": len(metrics),
            "period_hours": hours
        }
    
    # ============ Previsão de Falhas ============
    
    def predict_failure_risk(
        self,
        device_id: str,
        days: int = 7
    ) -> Dict[str, Any]:
        """
        Avalia o risco de falha de um dispositivo baseado em tendências.
        """
        device = self.db.query(Device).filter(Device.device_id == device_id).first()
        if not device:
            return {"device_id": device_id, "risk": "unknown", "score": 0}
        
        since = datetime.utcnow() - timedelta(days=days)
        metrics = self.db.query(DeviceMetric)\
            .filter(DeviceMetric.device_id == device.id)\
            .filter(DeviceMetric.collected_at >= since)\
            .order_by(DeviceMetric.collected_at)\
            .all()
        
        if len(metrics) < 10:
            return {
                "device_id": device_id,
                "risk": "unknown",
                "score": 0,
                "message": "Dados históricos insuficientes"
            }
        
        risk_factors = []
        
        # Tendência de latência
        latencies = [m.ping_latency_ms for m in metrics if m.ping_latency_ms]
        if latencies:
            trend = self.detect_trend(latencies)
            if trend == "increasing":
                risk_factors.append({
                    "factor": "latency_trend",
                    "trend": trend,
                    "weight": 20,
                    "message": "Latência em tendência de alta"
                })
        
        # Tendência de packet loss
        packet_losses = [m.ping_packet_loss for m in metrics if m.ping_packet_loss is not None]
        if packet_losses:
            trend = self.detect_trend(packet_losses)
            if trend == "increasing":
                risk_factors.append({
                    "factor": "packet_loss_trend",
                    "trend": trend,
                    "weight": 25,
                    "message": "Perda de pacotes em tendência de alta"
                })
        
        # Reboots frequentes (uptime resetando)
        uptimes = [m.uptime_seconds for m in metrics if m.uptime_seconds is not None]
        if len(uptimes) > 2:
            reboot_count = sum(1 for i in range(1, len(uptimes)) if uptimes[i] < uptimes[i-1])
            if reboot_count > 3:
                risk_factors.append({
                    "factor": "frequent_reboots",
                    "reboots": reboot_count,
                    "weight": 30,
                    "message": f"Reboots frequentes detectados ({reboot_count}x em {days} dias)"
                })
        
        # Offline periods (verificar gaps nos dados)
        if len(metrics) > 1:
            offline_periods = 0
            for i in range(1, len(metrics)):
                gap = (metrics[i].collected_at - metrics[i-1].collected_at).total_seconds()
                if gap > 1800:  # > 30 min sem dados
                    offline_periods += 1
            
            if offline_periods > 5:
                risk_factors.append({
                    "factor": "offline_periods",
                    "count": offline_periods,
                    "weight": 15,
                    "message": f"Múltiplos períodos offline ({offline_periods}x)"
                })
        
        # Calcular score de risco
        risk_score = sum(f["weight"] for f in risk_factors)
        
        if risk_score >= 50:
            risk_level = "high"
        elif risk_score >= 25:
            risk_level = "medium"
        elif risk_score > 0:
            risk_level = "low"
        else:
            risk_level = "minimal"
        
        return {
            "device_id": device_id,
            "risk_level": risk_level,
            "risk_score": min(100, risk_score),
            "risk_factors": risk_factors,
            "analysis_period_days": days,
            "samples_analyzed": len(metrics)
        }
    
    # ============ Recomendações ============
    
    def get_recommendations(
        self,
        device_id: str
    ) -> List[Dict[str, Any]]:
        """
        Gera recomendações automáticas baseadas na análise do dispositivo.
        """
        recommendations = []
        
        # Obter anomalias e risco
        anomalies = self.detect_anomalies(device_id, hours=24)
        risk = self.predict_failure_risk(device_id, days=7)
        
        device = self.db.query(Device).filter(Device.device_id == device_id).first()
        if not device:
            return recommendations
        
        # Recomendações baseadas em anomalias
        for anomaly in anomalies.get("anomalies", []):
            if anomaly["metric"] == "ping_latency_ms":
                recommendations.append({
                    "priority": "high" if anomaly["severity"] == "critical" else "medium",
                    "category": "connectivity",
                    "action": "check_connection",
                    "title": "Verificar conexão física",
                    "description": "A latência elevada pode indicar problemas no cabo, conectores ou fibra. Verificar estado físico da conexão.",
                    "trigger": anomaly["message"]
                })
            
            elif anomaly["metric"] == "ping_packet_loss":
                recommendations.append({
                    "priority": "high",
                    "category": "connectivity",
                    "action": "check_signal",
                    "title": "Verificar qualidade do sinal",
                    "description": "Perda de pacotes pode indicar interferência ou degradação do sinal óptico. Verificar potência de sinal e limpeza dos conectores.",
                    "trigger": anomaly["message"]
                })
            
            elif anomaly["metric"] == "cpu_usage":
                recommendations.append({
                    "priority": "medium",
                    "category": "performance",
                    "action": "reboot_device",
                    "title": "Reiniciar dispositivo",
                    "description": "CPU elevada pode indicar travamento ou excesso de processos. Um reboot pode resolver.",
                    "trigger": anomaly["message"]
                })
            
            elif anomaly["metric"] == "wifi_clients":
                recommendations.append({
                    "priority": "low",
                    "category": "capacity",
                    "action": "review_capacity",
                    "title": "Revisar capacidade",
                    "description": "Muitos clientes WiFi podem degradar a experiência. Considere upgrade de equipamento ou AP adicional.",
                    "trigger": anomaly["message"]
                })
        
        # Recomendações baseadas em risco
        if risk.get("risk_level") in ["high", "medium"]:
            for factor in risk.get("risk_factors", []):
                if factor["factor"] == "frequent_reboots":
                    recommendations.append({
                        "priority": "high",
                        "category": "stability",
                        "action": "firmware_update",
                        "title": "Atualizar firmware",
                        "description": "Reboots frequentes podem indicar instabilidade. Verificar se há firmware mais recente disponível.",
                        "trigger": factor["message"]
                    })
                    recommendations.append({
                        "priority": "high",
                        "category": "hardware",
                        "action": "replace_device",
                        "title": "Avaliar troca de equipamento",
                        "description": "Se o problema persistir após atualização, o equipamento pode estar com defeito.",
                        "trigger": factor["message"]
                    })
        
        # Verificar se WiFi está configurado corretamente
        if device.ssid_24ghz and device.ssid_5ghz:
            if device.ssid_24ghz == device.ssid_5ghz:
                recommendations.append({
                    "priority": "low",
                    "category": "optimization",
                    "action": "split_ssids",
                    "title": "Separar SSIDs por banda",
                    "description": "Considere usar SSIDs diferentes para 2.4GHz e 5GHz para melhor controle dos dispositivos.",
                    "trigger": "SSIDs iguais para 2.4GHz e 5GHz"
                })
        
        return recommendations
    
    # ============ Análise de Frota ============
    
    def fleet_analysis(self) -> Dict[str, Any]:
        """
        Análise geral da frota de dispositivos.
        """
        total = self.db.query(Device).count()
        online = self.db.query(Device).filter(Device.is_online == True).count()
        offline = total - online
        
        # Dispositivos por fabricante
        by_manufacturer = self.db.query(
            Device.manufacturer,
            func.count(Device.id)
        ).group_by(Device.manufacturer).all()
        
        # Dispositivos por modelo
        by_model = self.db.query(
            Device.product_class,
            func.count(Device.id)
        ).group_by(Device.product_class).all()
        
        # Dispositivos com problemas (score < 70)
        problem_devices = []
        devices = self.db.query(Device).filter(Device.is_online == True).limit(100).all()
        
        for device in devices:
            anomalies = self.detect_anomalies(device.device_id, hours=6)
            if anomalies.get("health_score", 100) < 70:
                problem_devices.append({
                    "device_id": device.device_id,
                    "manufacturer": device.manufacturer,
                    "model": device.product_class,
                    "pppoe_login": device.pppoe_login,
                    "health_score": anomalies["health_score"],
                    "anomaly_count": len(anomalies.get("anomalies", []))
                })
        
        return {
            "summary": {
                "total_devices": total,
                "online": online,
                "offline": offline,
                "online_percentage": round(online / total * 100, 1) if total > 0 else 0
            },
            "by_manufacturer": [{"name": m[0] or "Unknown", "count": m[1]} for m in by_manufacturer],
            "by_model": [{"name": m[0] or "Unknown", "count": m[1]} for m in by_model],
            "problem_devices": sorted(problem_devices, key=lambda x: x["health_score"])[:10],
            "analysis_timestamp": datetime.utcnow().isoformat()
        }
    
    # ============ Previsão de Carga ============
    
    def predict_traffic(
        self,
        device_id: str,
        hours_ahead: int = 6
    ) -> Dict[str, Any]:
        """
        Previsão simples de tráfego baseada em padrões históricos.
        """
        device = self.db.query(Device).filter(Device.device_id == device_id).first()
        if not device:
            return {"device_id": device_id, "prediction": None}
        
        # Buscar métricas das últimas 24h
        since = datetime.utcnow() - timedelta(hours=24)
        metrics = self.db.query(DeviceMetric)\
            .filter(DeviceMetric.device_id == device.id)\
            .filter(DeviceMetric.collected_at >= since)\
            .order_by(DeviceMetric.collected_at)\
            .all()
        
        if len(metrics) < 6:
            return {"device_id": device_id, "prediction": None, "message": "Dados insuficientes"}
        
        # Calcular médias por hora do dia
        hourly_traffic = defaultdict(list)
        for m in metrics:
            hour = m.collected_at.hour
            traffic = (m.bytes_received or 0) + (m.bytes_sent or 0)
            hourly_traffic[hour].append(traffic)
        
        # Média por hora
        avg_by_hour = {h: np.mean(v) for h, v in hourly_traffic.items()}
        
        # Prever próximas horas
        predictions = []
        current_hour = datetime.utcnow().hour
        for i in range(1, hours_ahead + 1):
            target_hour = (current_hour + i) % 24
            if target_hour in avg_by_hour:
                predictions.append({
                    "hour": target_hour,
                    "predicted_bytes": avg_by_hour[target_hour],
                    "confidence": "medium"
                })
            else:
                # Usar média geral
                all_avg = np.mean(list(avg_by_hour.values())) if avg_by_hour else 0
                predictions.append({
                    "hour": target_hour,
                    "predicted_bytes": all_avg,
                    "confidence": "low"
                })
        
        return {
            "device_id": device_id,
            "predictions": predictions,
            "hourly_averages": avg_by_hour,
            "analysis_period_hours": 24
        }
