# app/services/metrics_service.py
# Serviço de coleta e armazenamento de métricas

from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, desc
import logging

from app.database.models import (
    Device, DeviceMetric, DiagnosticLog, WifiSnapshot,
    ClientSession, AlertEvent, TaskHistory, MetricAggregation
)

log = logging.getLogger("semppre-bridge.metrics")


class MetricsService:
    """Serviço para gerenciar métricas de dispositivos."""
    
    def __init__(self, db: Session):
        self.db = db
    
    # ============ Dispositivos ============
    
    def upsert_device(self, device_id: str, data: Dict[str, Any]) -> Device:
        """
        Cria ou atualiza um dispositivo no cache local.
        """
        device = self.db.query(Device).filter(Device.device_id == device_id).first()
        
        if not device:
            device = Device(device_id=device_id)
            self.db.add(device)
        
        # Atualizar campos
        for key, value in data.items():
            if hasattr(device, key) and value is not None:
                setattr(device, key, value)
        
        device.last_sync = datetime.utcnow()
        self.db.commit()
        self.db.refresh(device)
        
        return device
    
    def get_device(self, device_id: str) -> Optional[Device]:
        """Busca dispositivo pelo ID do GenieACS."""
        return self.db.query(Device).filter(Device.device_id == device_id).first()
    
    def get_device_by_login(self, pppoe_login: str) -> Optional[Device]:
        """Busca dispositivo pelo login PPPoE."""
        return self.db.query(Device).filter(Device.pppoe_login == pppoe_login).first()
    
    def list_devices(
        self,
        is_online: Optional[bool] = None,
        manufacturer: Optional[str] = None,
        limit: int = 100,
        offset: int = 0
    ) -> List[Device]:
        """Lista dispositivos com filtros."""
        query = self.db.query(Device)
        
        if is_online is not None:
            query = query.filter(Device.is_online == is_online)
        if manufacturer:
            query = query.filter(Device.manufacturer.ilike(f"%{manufacturer}%"))
        
        return query.order_by(desc(Device.last_inform)).offset(offset).limit(limit).all()
    
    # ============ Métricas ============
    
    def record_metric(self, device_id: str, metrics: Dict[str, Any]) -> DeviceMetric:
        """
        Registra uma nova métrica para um dispositivo.
        """
        device = self.get_device(device_id)
        if not device:
            # Criar dispositivo se não existir
            device = self.upsert_device(device_id, {})
        
        metric = DeviceMetric(
            device_id=device.id,
            collected_at=datetime.utcnow(),
            **{k: v for k, v in metrics.items() if hasattr(DeviceMetric, k)}
        )
        
        # Campos extras vão para o JSON
        extra = {k: v for k, v in metrics.items() if not hasattr(DeviceMetric, k)}
        if extra:
            metric.extra_metrics = extra
        
        self.db.add(metric)
        self.db.commit()
        self.db.refresh(metric)
        
        return metric
    
    def get_metrics(
        self,
        device_id: str,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        limit: int = 100
    ) -> List[DeviceMetric]:
        """
        Busca métricas de um dispositivo em um período.
        """
        device = self.get_device(device_id)
        if not device:
            return []
        
        query = self.db.query(DeviceMetric).filter(DeviceMetric.device_id == device.id)
        
        if start_time:
            query = query.filter(DeviceMetric.collected_at >= start_time)
        if end_time:
            query = query.filter(DeviceMetric.collected_at <= end_time)
        
        return query.order_by(desc(DeviceMetric.collected_at)).limit(limit).all()
    
    def get_latest_metric(self, device_id: str) -> Optional[DeviceMetric]:
        """Busca a métrica mais recente de um dispositivo."""
        device = self.get_device(device_id)
        if not device:
            return None
        
        return self.db.query(DeviceMetric)\
            .filter(DeviceMetric.device_id == device.id)\
            .order_by(desc(DeviceMetric.collected_at))\
            .first()
    
    def get_metrics_summary(
        self,
        device_id: str,
        hours: int = 24
    ) -> Dict[str, Any]:
        """
        Retorna resumo estatístico das métricas das últimas N horas.
        """
        device = self.get_device(device_id)
        if not device:
            return {}
        
        since = datetime.utcnow() - timedelta(hours=hours)
        
        result = self.db.query(
            func.count(DeviceMetric.id).label("total_samples"),
            func.avg(DeviceMetric.ping_latency_ms).label("avg_latency"),
            func.min(DeviceMetric.ping_latency_ms).label("min_latency"),
            func.max(DeviceMetric.ping_latency_ms).label("max_latency"),
            func.avg(DeviceMetric.ping_packet_loss).label("avg_packet_loss"),
            func.sum(DeviceMetric.bytes_received).label("total_bytes_rx"),
            func.sum(DeviceMetric.bytes_sent).label("total_bytes_tx"),
            func.avg(DeviceMetric.wifi_clients_24ghz + DeviceMetric.wifi_clients_5ghz).label("avg_wifi_clients"),
            func.max(DeviceMetric.wifi_clients_24ghz + DeviceMetric.wifi_clients_5ghz).label("max_wifi_clients"),
        ).filter(
            DeviceMetric.device_id == device.id,
            DeviceMetric.collected_at >= since
        ).first()
        
        return {
            "period_hours": hours,
            "total_samples": result.total_samples or 0,
            "latency": {
                "avg_ms": round(result.avg_latency or 0, 2),
                "min_ms": round(result.min_latency or 0, 2),
                "max_ms": round(result.max_latency or 0, 2),
            },
            "packet_loss_avg": round(result.avg_packet_loss or 0, 2),
            "traffic": {
                "total_rx_bytes": result.total_bytes_rx or 0,
                "total_tx_bytes": result.total_bytes_tx or 0,
            },
            "wifi_clients": {
                "avg": round(result.avg_wifi_clients or 0, 1),
                "max": result.max_wifi_clients or 0,
            }
        }
    
    # ============ Diagnósticos ============
    
    def create_diagnostic(
        self,
        device_id: str,
        diagnostic_type: str,
        target_host: Optional[str] = None,
        parameters: Optional[Dict] = None
    ) -> DiagnosticLog:
        """
        Cria um registro de diagnóstico.
        """
        device = self.get_device(device_id)
        if not device:
            device = self.upsert_device(device_id, {})
        
        diag = DiagnosticLog(
            device_id=device.id,
            diagnostic_type=diagnostic_type,
            target_host=target_host,
            parameters=parameters or {},
            status="pending",
            started_at=datetime.utcnow()
        )
        
        self.db.add(diag)
        self.db.commit()
        self.db.refresh(diag)
        
        return diag
    
    def update_diagnostic(
        self,
        diagnostic_id: int,
        status: str,
        result: Optional[Dict] = None,
        stdout: Optional[str] = None,
        stderr: Optional[str] = None,
        metrics: Optional[Dict] = None
    ) -> Optional[DiagnosticLog]:
        """
        Atualiza o resultado de um diagnóstico.
        """
        diag = self.db.query(DiagnosticLog).filter(DiagnosticLog.id == diagnostic_id).first()
        if not diag:
            return None
        
        diag.status = status
        if result:
            diag.result = result
        if stdout:
            diag.stdout = stdout
        if stderr:
            diag.stderr = stderr
        
        if status in ("success", "failed", "timeout"):
            diag.completed_at = datetime.utcnow()
            if diag.started_at:
                diag.duration_ms = int((diag.completed_at - diag.started_at).total_seconds() * 1000)
        
        # Métricas extraídas
        if metrics:
            diag.avg_latency_ms = metrics.get("avg_latency_ms")
            diag.min_latency_ms = metrics.get("min_latency_ms")
            diag.max_latency_ms = metrics.get("max_latency_ms")
            diag.packet_loss = metrics.get("packet_loss")
            diag.download_mbps = metrics.get("download_mbps")
            diag.upload_mbps = metrics.get("upload_mbps")
        
        self.db.commit()
        self.db.refresh(diag)
        
        return diag
    
    def get_diagnostics(
        self,
        device_id: str,
        diagnostic_type: Optional[str] = None,
        limit: int = 20
    ) -> List[DiagnosticLog]:
        """Lista diagnósticos de um dispositivo."""
        device = self.get_device(device_id)
        if not device:
            return []
        
        query = self.db.query(DiagnosticLog).filter(DiagnosticLog.device_id == device.id)
        
        if diagnostic_type:
            query = query.filter(DiagnosticLog.diagnostic_type == diagnostic_type)
        
        return query.order_by(desc(DiagnosticLog.started_at)).limit(limit).all()
    
    # ============ WiFi Snapshots ============
    
    def record_wifi_snapshot(
        self,
        device_id: str,
        band: str,
        config: Dict[str, Any]
    ) -> WifiSnapshot:
        """
        Registra um snapshot de configuração WiFi.
        """
        device = self.get_device(device_id)
        if not device:
            device = self.upsert_device(device_id, {})
        
        snapshot = WifiSnapshot(
            device_id=device.id,
            band=band,
            ssid=config.get("ssid"),
            hidden=config.get("hidden", False),
            enabled=config.get("enabled", True),
            security_mode=config.get("security_mode"),
            encryption=config.get("encryption"),
            channel=config.get("channel"),
            bandwidth=config.get("bandwidth"),
            tx_power=config.get("tx_power"),
            connected_clients=config.get("connected_clients", 0),
            client_macs=config.get("client_macs", []),
            captured_at=datetime.utcnow()
        )
        
        self.db.add(snapshot)
        self.db.commit()
        self.db.refresh(snapshot)
        
        return snapshot
    
    # ============ Alertas ============
    
    def create_alert(
        self,
        device_id: Optional[str],
        severity: str,
        category: str,
        title: str,
        message: Optional[str] = None,
        details: Optional[Dict] = None
    ) -> AlertEvent:
        """
        Cria um novo evento de alerta.
        """
        device = None
        device_db_id = None
        if device_id:
            device = self.get_device(device_id)
            device_db_id = device.id if device else None
        
        alert = AlertEvent(
            device_id=device_db_id,
            severity=severity,
            category=category,
            title=title,
            message=message,
            details=details or {},
            status="active",
            created_at=datetime.utcnow()
        )
        
        self.db.add(alert)
        self.db.commit()
        self.db.refresh(alert)
        
        log.info(f"Alert created: [{severity}] {title}")
        return alert
    
    def get_active_alerts(
        self,
        device_id: Optional[str] = None,
        severity: Optional[str] = None,
        limit: int = 50
    ) -> List[AlertEvent]:
        """Lista alertas ativos."""
        query = self.db.query(AlertEvent).filter(AlertEvent.status == "active")
        
        if device_id:
            device = self.get_device(device_id)
            if device:
                query = query.filter(AlertEvent.device_id == device.id)
        
        if severity:
            query = query.filter(AlertEvent.severity == severity)
        
        return query.order_by(desc(AlertEvent.created_at)).limit(limit).all()
    
    def acknowledge_alert(self, alert_id: int, by: str = "system") -> Optional[AlertEvent]:
        """Marca um alerta como reconhecido."""
        alert = self.db.query(AlertEvent).filter(AlertEvent.id == alert_id).first()
        if alert:
            alert.status = "acknowledged"
            alert.acknowledged_at = datetime.utcnow()
            alert.acknowledged_by = by
            self.db.commit()
            self.db.refresh(alert)
        return alert
    
    def resolve_alert(self, alert_id: int) -> Optional[AlertEvent]:
        """Marca um alerta como resolvido."""
        alert = self.db.query(AlertEvent).filter(AlertEvent.id == alert_id).first()
        if alert:
            alert.status = "resolved"
            alert.resolved_at = datetime.utcnow()
            self.db.commit()
            self.db.refresh(alert)
        return alert
    
    # ============ Task History ============
    
    def record_task(
        self,
        device_id: str,
        task_type: str,
        genie_task_id: Optional[str] = None,
        parameters: Optional[Dict] = None,
        triggered_by: str = "user"
    ) -> TaskHistory:
        """
        Registra uma tarefa enviada ao dispositivo.
        """
        device = self.get_device(device_id)
        if not device:
            device = self.upsert_device(device_id, {})
        
        task = TaskHistory(
            device_id=device.id,
            genie_task_id=genie_task_id,
            task_type=task_type,
            parameters=parameters or {},
            triggered_by=triggered_by,
            status="pending",
            created_at=datetime.utcnow()
        )
        
        self.db.add(task)
        self.db.commit()
        self.db.refresh(task)
        
        return task
    
    def update_task_status(
        self,
        task_id: int,
        status: str,
        fault_code: Optional[str] = None,
        fault_message: Optional[str] = None
    ) -> Optional[TaskHistory]:
        """Atualiza o status de uma tarefa."""
        task = self.db.query(TaskHistory).filter(TaskHistory.id == task_id).first()
        if not task:
            return None
        
        task.status = status
        if fault_code:
            task.fault_code = fault_code
        if fault_message:
            task.fault_message = fault_message
        
        if status == "running" and not task.started_at:
            task.started_at = datetime.utcnow()
        elif status in ("success", "failed"):
            task.completed_at = datetime.utcnow()
        
        self.db.commit()
        self.db.refresh(task)
        
        return task
    
    # ============ Agregações ============
    
    def aggregate_metrics(
        self,
        device_id: str,
        period_type: str = "hour"
    ) -> Optional[MetricAggregation]:
        """
        Cria agregação de métricas para o último período completo.
        """
        device = self.get_device(device_id)
        if not device:
            return None
        
        now = datetime.utcnow()
        
        # Determinar período
        if period_type == "hour":
            period_end = now.replace(minute=0, second=0, microsecond=0)
            period_start = period_end - timedelta(hours=1)
        elif period_type == "day":
            period_end = now.replace(hour=0, minute=0, second=0, microsecond=0)
            period_start = period_end - timedelta(days=1)
        elif period_type == "week":
            period_end = now.replace(hour=0, minute=0, second=0, microsecond=0)
            period_end -= timedelta(days=period_end.weekday())  # início da semana
            period_start = period_end - timedelta(weeks=1)
        else:
            return None
        
        # Verificar se já existe
        existing = self.db.query(MetricAggregation).filter(
            MetricAggregation.device_id == device.id,
            MetricAggregation.period_type == period_type,
            MetricAggregation.period_start == period_start
        ).first()
        
        if existing:
            return existing
        
        # Calcular agregações
        metrics = self.db.query(DeviceMetric).filter(
            DeviceMetric.device_id == device.id,
            DeviceMetric.collected_at >= period_start,
            DeviceMetric.collected_at < period_end
        ).all()
        
        if not metrics:
            return None
        
        # Calcular estatísticas
        latencies = [m.ping_latency_ms for m in metrics if m.ping_latency_ms]
        
        agg = MetricAggregation(
            device_id=device.id,
            period_type=period_type,
            period_start=period_start,
            period_end=period_end,
            total_bytes_rx=sum(m.bytes_received or 0 for m in metrics),
            total_bytes_tx=sum(m.bytes_sent or 0 for m in metrics),
            avg_bytes_rx=sum(m.bytes_received or 0 for m in metrics) / len(metrics),
            avg_bytes_tx=sum(m.bytes_sent or 0 for m in metrics) / len(metrics),
            avg_latency=sum(latencies) / len(latencies) if latencies else None,
            min_latency=min(latencies) if latencies else None,
            max_latency=max(latencies) if latencies else None,
            total_samples=len(metrics),
            avg_wifi_clients=sum((m.wifi_clients_24ghz or 0) + (m.wifi_clients_5ghz or 0) for m in metrics) / len(metrics),
            max_wifi_clients=max((m.wifi_clients_24ghz or 0) + (m.wifi_clients_5ghz or 0) for m in metrics)
        )
        
        self.db.add(agg)
        self.db.commit()
        self.db.refresh(agg)
        
        return agg
    
    # ============ Limpeza ============
    
    def cleanup_old_metrics(self, days: int = 30) -> int:
        """
        Remove métricas mais antigas que N dias.
        Retorna quantidade removida.
        """
        cutoff = datetime.utcnow() - timedelta(days=days)
        
        deleted = self.db.query(DeviceMetric)\
            .filter(DeviceMetric.collected_at < cutoff)\
            .delete()
        
        self.db.commit()
        log.info(f"Cleaned up {deleted} metrics older than {days} days")
        
        return deleted
