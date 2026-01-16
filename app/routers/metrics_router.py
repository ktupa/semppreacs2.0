# app/routers/metrics_router.py
# API de métricas e histórico

from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field

from app.database import get_db
from app.services.metrics_service import MetricsService

router = APIRouter(prefix="/metrics", tags=["Metrics"])


# ============ Schemas ============

class DeviceIn(BaseModel):
    device_id: str
    serial_number: Optional[str] = None
    manufacturer: Optional[str] = None
    product_class: Optional[str] = None
    pppoe_login: Optional[str] = None
    ixc_cliente_id: Optional[int] = None
    tag: Optional[str] = None
    is_online: Optional[bool] = None
    wan_ip: Optional[str] = None
    ssid_24ghz: Optional[str] = None
    ssid_5ghz: Optional[str] = None
    firmware_version: Optional[str] = None


class DeviceOut(BaseModel):
    id: int
    device_id: str
    serial_number: Optional[str]
    manufacturer: Optional[str]
    product_class: Optional[str]
    pppoe_login: Optional[str]
    is_online: bool
    last_inform: Optional[datetime]
    wan_ip: Optional[str]
    ssid_24ghz: Optional[str]
    ssid_5ghz: Optional[str]
    
    class Config:
        from_attributes = True


class MetricIn(BaseModel):
    bytes_received: Optional[float] = None
    bytes_sent: Optional[float] = None
    packets_received: Optional[int] = None
    packets_sent: Optional[int] = None
    ping_latency_ms: Optional[float] = None
    ping_jitter_ms: Optional[float] = None
    ping_packet_loss: Optional[float] = None
    wifi_clients_24ghz: Optional[int] = None
    wifi_clients_5ghz: Optional[int] = None
    channel_24ghz: Optional[int] = None
    channel_5ghz: Optional[int] = None
    cpu_usage: Optional[float] = None
    memory_usage: Optional[float] = None
    uptime_seconds: Optional[int] = None
    lan_clients: Optional[int] = None


class MetricOut(BaseModel):
    id: int
    collected_at: datetime
    bytes_received: Optional[float]
    bytes_sent: Optional[float]
    ping_latency_ms: Optional[float]
    ping_packet_loss: Optional[float]
    wifi_clients_24ghz: Optional[int]
    wifi_clients_5ghz: Optional[int]
    cpu_usage: Optional[float]
    memory_usage: Optional[float]
    uptime_seconds: Optional[int]
    
    class Config:
        from_attributes = True


class DiagnosticIn(BaseModel):
    diagnostic_type: str = Field(..., description="ping, traceroute, speedtest, iperf")
    target_host: Optional[str] = None
    parameters: Optional[Dict[str, Any]] = None


class DiagnosticResultIn(BaseModel):
    status: str = Field(..., description="success, failed, timeout")
    result: Optional[Dict[str, Any]] = None
    stdout: Optional[str] = None
    stderr: Optional[str] = None
    avg_latency_ms: Optional[float] = None
    min_latency_ms: Optional[float] = None
    max_latency_ms: Optional[float] = None
    packet_loss: Optional[float] = None
    download_mbps: Optional[float] = None
    upload_mbps: Optional[float] = None


class DiagnosticOut(BaseModel):
    id: int
    diagnostic_type: str
    target_host: Optional[str]
    status: str
    started_at: datetime
    completed_at: Optional[datetime]
    duration_ms: Optional[int]
    avg_latency_ms: Optional[float]
    packet_loss: Optional[float]
    download_mbps: Optional[float]
    upload_mbps: Optional[float]
    
    class Config:
        from_attributes = True


class AlertIn(BaseModel):
    device_id: Optional[str] = None
    severity: str = Field(..., description="info, warning, error, critical")
    category: str = Field(..., description="connectivity, wifi, wan, security, performance")
    title: str
    message: Optional[str] = None
    details: Optional[Dict[str, Any]] = None


class AlertOut(BaseModel):
    id: int
    severity: str
    category: str
    title: str
    message: Optional[str]
    status: str
    created_at: datetime
    acknowledged_at: Optional[datetime]
    resolved_at: Optional[datetime]
    
    class Config:
        from_attributes = True


class TaskIn(BaseModel):
    task_type: str
    genie_task_id: Optional[str] = None
    parameters: Optional[Dict[str, Any]] = None
    triggered_by: str = "user"


class TaskOut(BaseModel):
    id: int
    genie_task_id: Optional[str]
    task_type: str
    status: str
    triggered_by: str
    created_at: datetime
    completed_at: Optional[datetime]
    fault_code: Optional[str]
    fault_message: Optional[str]
    
    class Config:
        from_attributes = True


# ============ Endpoints - Dispositivos ============

@router.post("/devices", response_model=DeviceOut)
def upsert_device(data: DeviceIn, db: Session = Depends(get_db)):
    """Cria ou atualiza um dispositivo no cache local."""
    svc = MetricsService(db)
    device = svc.upsert_device(data.device_id, data.model_dump(exclude_unset=True))
    return device


@router.get("/devices", response_model=List[DeviceOut])
def list_devices(
    is_online: Optional[bool] = None,
    manufacturer: Optional[str] = None,
    limit: int = Query(100, le=500),
    offset: int = 0,
    db: Session = Depends(get_db)
):
    """Lista dispositivos com filtros."""
    svc = MetricsService(db)
    return svc.list_devices(is_online=is_online, manufacturer=manufacturer, limit=limit, offset=offset)


@router.get("/devices/{device_id}", response_model=DeviceOut)
def get_device(device_id: str, db: Session = Depends(get_db)):
    """Busca um dispositivo pelo ID."""
    svc = MetricsService(db)
    device = svc.get_device(device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    return device


# ============ Endpoints - Métricas ============

@router.post("/devices/{device_id}/metrics", response_model=MetricOut)
def record_metric(device_id: str, data: MetricIn, db: Session = Depends(get_db)):
    """Registra uma nova métrica para um dispositivo."""
    svc = MetricsService(db)
    metric = svc.record_metric(device_id, data.model_dump(exclude_unset=True))
    return metric


@router.get("/devices/{device_id}/metrics", response_model=List[MetricOut])
def get_metrics(
    device_id: str,
    hours: int = Query(24, description="Buscar métricas das últimas N horas"),
    limit: int = Query(100, le=1000),
    db: Session = Depends(get_db)
):
    """Busca métricas de um dispositivo."""
    svc = MetricsService(db)
    start_time = datetime.utcnow() - timedelta(hours=hours)
    return svc.get_metrics(device_id, start_time=start_time, limit=limit)


@router.get("/devices/{device_id}/metrics/latest", response_model=Optional[MetricOut])
def get_latest_metric(device_id: str, db: Session = Depends(get_db)):
    """Busca a métrica mais recente de um dispositivo."""
    svc = MetricsService(db)
    return svc.get_latest_metric(device_id)


@router.get("/devices/{device_id}/metrics/summary")
def get_metrics_summary(
    device_id: str,
    hours: int = Query(24, description="Período em horas"),
    db: Session = Depends(get_db)
):
    """Retorna resumo estatístico das métricas."""
    svc = MetricsService(db)
    return svc.get_metrics_summary(device_id, hours=hours)


# ============ Endpoints - Diagnósticos ============

@router.post("/devices/{device_id}/diagnostics", response_model=DiagnosticOut)
def create_diagnostic(device_id: str, data: DiagnosticIn, db: Session = Depends(get_db)):
    """Cria um registro de diagnóstico."""
    svc = MetricsService(db)
    return svc.create_diagnostic(
        device_id,
        data.diagnostic_type,
        data.target_host,
        data.parameters
    )


@router.patch("/diagnostics/{diagnostic_id}", response_model=DiagnosticOut)
def update_diagnostic(
    diagnostic_id: int,
    data: DiagnosticResultIn,
    db: Session = Depends(get_db)
):
    """Atualiza o resultado de um diagnóstico."""
    svc = MetricsService(db)
    
    metrics = {}
    if data.avg_latency_ms is not None:
        metrics["avg_latency_ms"] = data.avg_latency_ms
    if data.min_latency_ms is not None:
        metrics["min_latency_ms"] = data.min_latency_ms
    if data.max_latency_ms is not None:
        metrics["max_latency_ms"] = data.max_latency_ms
    if data.packet_loss is not None:
        metrics["packet_loss"] = data.packet_loss
    if data.download_mbps is not None:
        metrics["download_mbps"] = data.download_mbps
    if data.upload_mbps is not None:
        metrics["upload_mbps"] = data.upload_mbps
    
    diag = svc.update_diagnostic(
        diagnostic_id,
        data.status,
        data.result,
        data.stdout,
        data.stderr,
        metrics if metrics else None
    )
    
    if not diag:
        raise HTTPException(status_code=404, detail="Diagnostic not found")
    
    return diag


@router.get("/devices/{device_id}/diagnostics", response_model=List[DiagnosticOut])
def get_diagnostics(
    device_id: str,
    diagnostic_type: Optional[str] = None,
    limit: int = Query(20, le=100),
    db: Session = Depends(get_db)
):
    """Lista diagnósticos de um dispositivo."""
    svc = MetricsService(db)
    return svc.get_diagnostics(device_id, diagnostic_type, limit)


# ============ Endpoints - Alertas ============

@router.post("/alerts", response_model=AlertOut)
def create_alert(data: AlertIn, db: Session = Depends(get_db)):
    """Cria um novo alerta."""
    svc = MetricsService(db)
    return svc.create_alert(
        data.device_id,
        data.severity,
        data.category,
        data.title,
        data.message,
        data.details
    )


@router.get("/alerts", response_model=List[AlertOut])
def get_alerts(
    device_id: Optional[str] = None,
    severity: Optional[str] = None,
    limit: int = Query(50, le=200),
    db: Session = Depends(get_db)
):
    """Lista alertas ativos."""
    svc = MetricsService(db)
    return svc.get_active_alerts(device_id, severity, limit)


@router.patch("/alerts/{alert_id}/acknowledge", response_model=AlertOut)
def acknowledge_alert(
    alert_id: int,
    by: str = Query("user"),
    db: Session = Depends(get_db)
):
    """Marca um alerta como reconhecido."""
    svc = MetricsService(db)
    alert = svc.acknowledge_alert(alert_id, by)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    return alert


@router.patch("/alerts/{alert_id}/resolve", response_model=AlertOut)
def resolve_alert(alert_id: int, db: Session = Depends(get_db)):
    """Marca um alerta como resolvido."""
    svc = MetricsService(db)
    alert = svc.resolve_alert(alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    return alert


# ============ Endpoints - Tarefas ============

@router.post("/devices/{device_id}/tasks", response_model=TaskOut)
def record_task(device_id: str, data: TaskIn, db: Session = Depends(get_db)):
    """Registra uma tarefa enviada ao dispositivo."""
    svc = MetricsService(db)
    return svc.record_task(
        device_id,
        data.task_type,
        data.genie_task_id,
        data.parameters,
        data.triggered_by
    )


@router.patch("/tasks/{task_id}/status", response_model=TaskOut)
def update_task_status(
    task_id: int,
    status: str,
    fault_code: Optional[str] = None,
    fault_message: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Atualiza o status de uma tarefa."""
    svc = MetricsService(db)
    task = svc.update_task_status(task_id, status, fault_code, fault_message)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


# ============ Endpoints - Manutenção ============

@router.post("/maintenance/cleanup")
def cleanup_old_data(
    days: int = Query(30, description="Remover dados mais antigos que N dias"),
    db: Session = Depends(get_db)
):
    """Remove dados antigos para manutenção."""
    svc = MetricsService(db)
    deleted = svc.cleanup_old_metrics(days)
    return {"deleted_metrics": deleted, "days": days}


@router.post("/devices/{device_id}/aggregate")
def aggregate_metrics(
    device_id: str,
    period_type: str = Query("hour", description="hour, day, week"),
    db: Session = Depends(get_db)
):
    """Cria agregação de métricas para o último período."""
    svc = MetricsService(db)
    agg = svc.aggregate_metrics(device_id, period_type)
    if not agg:
        raise HTTPException(status_code=404, detail="No metrics to aggregate")
    return {
        "id": agg.id,
        "period_type": agg.period_type,
        "period_start": agg.period_start,
        "period_end": agg.period_end,
        "total_samples": agg.total_samples,
        "avg_latency": agg.avg_latency,
        "total_bytes_rx": agg.total_bytes_rx,
        "total_bytes_tx": agg.total_bytes_tx
    }
