# app/routers/feeds_router.py
"""
Router para ingestão e consulta de feeds (métricas de dispositivos, alertas, tarefas).

Endpoints:
- POST /feeds/ingest : Recebe métricas e persiste em device_metrics; dispara análises rápidas.
- GET  /feeds/alerts : Lista alertas recentes do banco de dados (AlertEvent)
- GET  /feeds/tasks  : Lista tarefas recentes do banco de dados (TaskHistory)
- GET  /feeds/metrics: Lista métricas recentes persistidas (DeviceMetric)
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, List

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.database.connection import get_db
from app.database.models import Device, DeviceMetric, AlertEvent, TaskHistory
from app.ml import learning_engine, network_analyzer

log = logging.getLogger("semppre-bridge.feeds")

router = APIRouter(prefix="/feeds", tags=["Feeds"])


@router.post("/ingest")
async def ingest_metrics(payload: Dict[str, Any] = Body(...), db: Session = Depends(get_db)):
    """Ingest de métricas. Espera JSON com pelo menos `device_id` e `metrics`.
    `metrics` pode ser um dict {metric_name: value} ou lista de samples.
    """
    try:
        device_id_external = payload.get("device_id") or payload.get("device")
        if not device_id_external:
            raise HTTPException(status_code=400, detail="device_id é obrigatório")

        # Tentar localizar Device interno
        device = db.query(Device).filter(Device.device_id == device_id_external).first()
        if not device:
            # Criar registro mínimo se não existir
            device = Device(device_id=device_id_external)
            db.add(device)
            db.commit()
            db.refresh(device)

        metrics = payload.get("metrics") or {}
        ts = payload.get("timestamp")
        if ts:
            try:
                collected_at = datetime.fromisoformat(ts)
            except Exception:
                collected_at = datetime.utcnow()
        else:
            collected_at = datetime.utcnow()

        # Mapear métricas comuns para DeviceMetric
        dm = DeviceMetric(
            device_id=device.id,
            collected_at=collected_at,
            extra_metrics={},
        )

        # Known keys mapping
        mapping = {
            "bytes_received": "bytes_received",
            "bytes_sent": "bytes_sent",
            "packets_received": "packets_received",
            "packets_sent": "packets_sent",
            "errors_received": "errors_received",
            "errors_sent": "errors_sent",
            "latency_ms": "ping_latency_ms",
            "ping_latency_ms": "ping_latency_ms",
            "ping_jitter_ms": "ping_jitter_ms",
            "packet_loss_pct": "ping_packet_loss",
            "wifi_clients_24ghz": "wifi_clients_24ghz",
            "wifi_clients_5ghz": "wifi_clients_5ghz",
            "channel_24ghz": "channel_24ghz",
            "channel_5ghz": "channel_5ghz",
            "noise_24ghz": "noise_24ghz",
            "noise_5ghz": "noise_5ghz",
            "cpu_usage": "cpu_usage",
            "memory_usage": "memory_usage",
            "uptime_seconds": "uptime_seconds",
            "lan_clients": "lan_clients",
        }

        for k, v in metrics.items():
            key = mapping.get(k, None)
            try:
                if key and hasattr(dm, key):
                    setattr(dm, key, v)
                else:
                    # Guarda em extras
                    if isinstance(dm.extra_metrics, dict):
                        dm.extra_metrics[k] = v
                    else:
                        dm.extra_metrics = {k: v}
            except Exception:
                # segurança: nunca falhar por causa de tipo
                if isinstance(dm.extra_metrics, dict):
                    dm.extra_metrics[k] = v

        db.add(dm)
        db.commit()
        db.refresh(dm)

        # Atualizar baseline no learning engine (assíncrono rápido)
        try:
            baseline_metrics = {}
            # escolher métricas úteis para baseline
            for mkey in ["ping_latency_ms", "ping_packet_loss", "cpu_usage", "memory_usage"]:
                if getattr(dm, mkey, None) is not None:
                    baseline_metrics[mkey] = getattr(dm, mkey)
            if baseline_metrics:
                learning_engine.update_baseline(device_id_external, baseline_metrics)
        except Exception as e:
            log.warning(f"learning_engine.update_baseline falhou: {e}")

        # Rodar detecção rápida de anomalias (síncrono leve)
        try:
            metric_values = {}
            # transformar em shapes simples para network_analyzer
            if dm.ping_latency_ms is not None:
                metric_values.setdefault("latency_ms", []).append(dm.ping_latency_ms)
            if dm.ping_packet_loss is not None:
                metric_values.setdefault("packet_loss_pct", []).append(dm.ping_packet_loss)
            # incluir alguns extras se existirem
            for k, v in (dm.extra_metrics or {}).items():
                if isinstance(v, (int, float)):
                    metric_values.setdefault(k, []).append(v)

            if metric_values:
                anomalies = network_analyzer.detect_anomalies(device_id_external, metric_values)
                # se anomalias significativas, persistir AlertEvent
                for a in anomalies:
                    if a.severity > 0.5:
                        alert = AlertEvent(
                            device_id=device.id,
                            severity="error" if a.severity > 0.7 else "warning",
                            category="performance",
                            title=f"Anomalia: {a.anomaly_type.value}",
                            message=a.description,
                            details=a.to_dict(),
                        )
                        db.add(alert)
                if anomalies:
                    db.commit()
        except Exception as e:
            log.warning(f"network_analyzer.detect_anomalies falhou: {e}")

        return {"success": True, "device_id": device_id_external, "metric_id": dm.id}
    except HTTPException:
        raise
    except Exception as e:
        log.exception(f"Erro ingest metrics: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
#  GET /feeds/alerts - Lista alertas recentes
# =============================================================================
@router.get("/alerts")
async def list_alerts(
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    severity: Optional[str] = Query(None, description="Filtrar por severidade: info, warning, error, critical"),
    category: Optional[str] = Query(None, description="Filtrar por categoria: connectivity, wifi, wan, security, performance"),
    status: Optional[str] = Query(None, description="Filtrar por status: active, acknowledged, resolved"),
    device_id: Optional[str] = Query(None, description="Filtrar por device_id externo"),
    hours: Optional[int] = Query(None, description="Buscar apenas alertas das últimas N horas"),
    db: Session = Depends(get_db)
):
    """Lista alertas recentes do banco de dados (AlertEvent)."""
    try:
        query = db.query(AlertEvent)

        # Filtros
        if severity:
            query = query.filter(AlertEvent.severity == severity)
        if category:
            query = query.filter(AlertEvent.category == category)
        if status:
            query = query.filter(AlertEvent.status == status)
        if device_id:
            device = db.query(Device).filter(Device.device_id == device_id).first()
            if device:
                query = query.filter(AlertEvent.device_id == device.id)
            else:
                # device não encontrado, retorna lista vazia
                return {
                    "success": True,
                    "total": 0,
                    "alerts": [],
                }
        if hours:
            cutoff = datetime.utcnow() - timedelta(hours=hours)
            query = query.filter(AlertEvent.created_at >= cutoff)

        # Total antes de paginação
        total = query.count()

        # Ordenar por mais recente primeiro e paginar
        alerts = query.order_by(desc(AlertEvent.created_at)).offset(offset).limit(limit).all()

        # Serializar
        result = []
        for a in alerts:
            # Buscar device_id externo se houver
            device_ext = None
            if a.device_id:
                dev = db.query(Device).filter(Device.id == a.device_id).first()
                if dev:
                    device_ext = dev.device_id
            result.append({
                "id": a.id,
                "device_id": device_ext,
                "severity": a.severity,
                "category": a.category,
                "title": a.title,
                "message": a.message,
                "status": a.status,
                "created_at": a.created_at.isoformat() if a.created_at else None,
                "acknowledged_at": a.acknowledged_at.isoformat() if a.acknowledged_at else None,
                "resolved_at": a.resolved_at.isoformat() if a.resolved_at else None,
                "details": a.details or {},
            })

        return {
            "success": True,
            "total": total,
            "alerts": result,
        }
    except Exception as e:
        log.exception(f"Erro listando alertas: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
#  GET /feeds/tasks - Lista tarefas recentes
# =============================================================================
@router.get("/tasks")
async def list_tasks(
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    status: Optional[str] = Query(None, description="Filtrar por status: pending, running, success, failed"),
    task_type: Optional[str] = Query(None, description="Filtrar por tipo: reboot, setParameterValues, download, etc"),
    device_id: Optional[str] = Query(None, description="Filtrar por device_id externo"),
    hours: Optional[int] = Query(None, description="Buscar apenas tarefas das últimas N horas"),
    db: Session = Depends(get_db)
):
    """Lista tarefas recentes do banco de dados (TaskHistory)."""
    try:
        query = db.query(TaskHistory)

        # Filtros
        if status:
            query = query.filter(TaskHistory.status == status)
        if task_type:
            query = query.filter(TaskHistory.task_type == task_type)
        if device_id:
            device = db.query(Device).filter(Device.device_id == device_id).first()
            if device:
                query = query.filter(TaskHistory.device_id == device.id)
            else:
                return {"success": True, "total": 0, "tasks": []}
        if hours:
            cutoff = datetime.utcnow() - timedelta(hours=hours)
            query = query.filter(TaskHistory.created_at >= cutoff)

        total = query.count()
        tasks = query.order_by(desc(TaskHistory.created_at)).offset(offset).limit(limit).all()

        result = []
        for t in tasks:
            device_ext = None
            if t.device_id:
                dev = db.query(Device).filter(Device.id == t.device_id).first()
                if dev:
                    device_ext = dev.device_id
            result.append({
                "id": t.id,
                "genie_task_id": t.genie_task_id,
                "device_id": device_ext,
                "task_type": t.task_type,
                "status": t.status,
                "fault_code": t.fault_code,
                "fault_message": t.fault_message,
                "triggered_by": t.triggered_by,
                "created_at": t.created_at.isoformat() if t.created_at else None,
                "started_at": t.started_at.isoformat() if t.started_at else None,
                "completed_at": t.completed_at.isoformat() if t.completed_at else None,
                "parameters": t.parameters or {},
            })

        return {"success": True, "total": total, "tasks": result}
    except Exception as e:
        log.exception(f"Erro listando tarefas: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
#  GET /feeds/metrics - Lista métricas recentes
# =============================================================================
@router.get("/metrics")
async def list_metrics(
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    device_id: Optional[str] = Query(None, description="Filtrar por device_id externo"),
    hours: Optional[int] = Query(24, description="Buscar apenas métricas das últimas N horas"),
    db: Session = Depends(get_db)
):
    """Lista métricas recentes persistidas (DeviceMetric)."""
    try:
        query = db.query(DeviceMetric)

        if device_id:
            device = db.query(Device).filter(Device.device_id == device_id).first()
            if device:
                query = query.filter(DeviceMetric.device_id == device.id)
            else:
                return {"success": True, "total": 0, "metrics": []}

        if hours:
            cutoff = datetime.utcnow() - timedelta(hours=hours)
            query = query.filter(DeviceMetric.collected_at >= cutoff)

        total = query.count()
        metrics = query.order_by(desc(DeviceMetric.collected_at)).offset(offset).limit(limit).all()

        result = []
        for m in metrics:
            device_ext = None
            if m.device_id:
                dev = db.query(Device).filter(Device.id == m.device_id).first()
                if dev:
                    device_ext = dev.device_id
            result.append({
                "id": m.id,
                "device_id": device_ext,
                "collected_at": m.collected_at.isoformat() if m.collected_at else None,
                "bytes_received": m.bytes_received,
                "bytes_sent": m.bytes_sent,
                "packets_received": m.packets_received,
                "packets_sent": m.packets_sent,
                "errors_received": m.errors_received,
                "errors_sent": m.errors_sent,
                "ping_latency_ms": m.ping_latency_ms,
                "ping_jitter_ms": m.ping_jitter_ms,
                "ping_packet_loss": m.ping_packet_loss,
                "wifi_clients_24ghz": m.wifi_clients_24ghz,
                "wifi_clients_5ghz": m.wifi_clients_5ghz,
                "channel_24ghz": m.channel_24ghz,
                "channel_5ghz": m.channel_5ghz,
                "noise_24ghz": m.noise_24ghz,
                "noise_5ghz": m.noise_5ghz,
                "cpu_usage": m.cpu_usage,
                "memory_usage": m.memory_usage,
                "uptime_seconds": m.uptime_seconds,
                "lan_clients": m.lan_clients,
                "extra_metrics": m.extra_metrics or {},
            })

        return {"success": True, "total": total, "metrics": result}
    except Exception as e:
        log.exception(f"Erro listando métricas: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
#  PATCH /feeds/alerts/{alert_id} - Atualizar status de um alerta
# =============================================================================
@router.patch("/alerts/{alert_id}")
async def update_alert(
    alert_id: int,
    payload: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db)
):
    """Atualiza status de um alerta (acknowledge, resolve)."""
    try:
        alert = db.query(AlertEvent).filter(AlertEvent.id == alert_id).first()
        if not alert:
            raise HTTPException(status_code=404, detail="Alerta não encontrado")

        new_status = payload.get("status")
        if new_status:
            if new_status not in ("active", "acknowledged", "resolved"):
                raise HTTPException(status_code=400, detail="Status inválido")
            alert.status = new_status
            if new_status == "acknowledged":
                alert.acknowledged_at = datetime.utcnow()
                alert.acknowledged_by = payload.get("acknowledged_by", "user")
            elif new_status == "resolved":
                alert.resolved_at = datetime.utcnow()

        db.commit()
        db.refresh(alert)

        return {"success": True, "alert_id": alert.id, "status": alert.status}
    except HTTPException:
        raise
    except Exception as e:
        log.exception(f"Erro atualizando alerta: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
#  POST /feeds/tasks - Criar registro de tarefa (log manual ou sincronização)
# =============================================================================
@router.post("/tasks")
async def create_task(
    payload: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db)
):
    """Cria um registro de tarefa (TaskHistory) no banco."""
    try:
        device_id_external = payload.get("device_id")
        device_fk = None
        if device_id_external:
            device = db.query(Device).filter(Device.device_id == device_id_external).first()
            if device:
                device_fk = device.id
            else:
                # criar device mínimo
                device = Device(device_id=device_id_external)
                db.add(device)
                db.commit()
                db.refresh(device)
                device_fk = device.id

        if not device_fk:
            raise HTTPException(status_code=400, detail="device_id é obrigatório")

        task = TaskHistory(
            device_id=device_fk,
            genie_task_id=payload.get("genie_task_id"),
            task_type=payload.get("task_type", "unknown"),
            parameters=payload.get("parameters", {}),
            status=payload.get("status", "pending"),
            fault_code=payload.get("fault_code"),
            fault_message=payload.get("fault_message"),
            triggered_by=payload.get("triggered_by", "api"),
        )

        if payload.get("started_at"):
            try:
                task.started_at = datetime.fromisoformat(payload["started_at"])
            except Exception:
                pass
        if payload.get("completed_at"):
            try:
                task.completed_at = datetime.fromisoformat(payload["completed_at"])
            except Exception:
                pass

        db.add(task)
        db.commit()
        db.refresh(task)

        return {"success": True, "task_id": task.id}
    except HTTPException:
        raise
    except Exception as e:
        log.exception(f"Erro criando tarefa: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
#  PATCH /feeds/tasks/{task_id} - Atualizar status de uma tarefa
# =============================================================================
@router.patch("/tasks/{task_id}")
async def update_task(
    task_id: int,
    payload: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db)
):
    """Atualiza status de uma tarefa (TaskHistory)."""
    try:
        task = db.query(TaskHistory).filter(TaskHistory.id == task_id).first()
        if not task:
            raise HTTPException(status_code=404, detail="Tarefa não encontrada")

        if "status" in payload:
            if payload["status"] not in ("pending", "running", "success", "failed"):
                raise HTTPException(status_code=400, detail="Status inválido")
            task.status = payload["status"]
            if payload["status"] == "running" and not task.started_at:
                task.started_at = datetime.utcnow()
            elif payload["status"] in ("success", "failed"):
                task.completed_at = datetime.utcnow()

        if "fault_code" in payload:
            task.fault_code = payload["fault_code"]
        if "fault_message" in payload:
            task.fault_message = payload["fault_message"]

        db.commit()
        db.refresh(task)

        return {"success": True, "task_id": task.id, "status": task.status}
    except HTTPException:
        raise
    except Exception as e:
        log.exception(f"Erro atualizando tarefa: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
#  GET /feeds/summary - Resumo geral de feeds (contagens)
# =============================================================================
@router.get("/summary")
async def feeds_summary(
    hours: int = Query(24, description="Período em horas para o resumo"),
    db: Session = Depends(get_db)
):
    """Resumo geral: contagem de alertas, tarefas e métricas recentes."""
    try:
        cutoff = datetime.utcnow() - timedelta(hours=hours)

        # Contagens de alertas por severidade
        alerts_total = db.query(AlertEvent).filter(AlertEvent.created_at >= cutoff).count()
        alerts_critical = db.query(AlertEvent).filter(
            AlertEvent.created_at >= cutoff,
            AlertEvent.severity == "critical"
        ).count()
        alerts_error = db.query(AlertEvent).filter(
            AlertEvent.created_at >= cutoff,
            AlertEvent.severity == "error"
        ).count()
        alerts_warning = db.query(AlertEvent).filter(
            AlertEvent.created_at >= cutoff,
            AlertEvent.severity == "warning"
        ).count()
        alerts_active = db.query(AlertEvent).filter(
            AlertEvent.created_at >= cutoff,
            AlertEvent.status == "active"
        ).count()

        # Contagens de tarefas por status
        tasks_total = db.query(TaskHistory).filter(TaskHistory.created_at >= cutoff).count()
        tasks_pending = db.query(TaskHistory).filter(
            TaskHistory.created_at >= cutoff,
            TaskHistory.status == "pending"
        ).count()
        tasks_success = db.query(TaskHistory).filter(
            TaskHistory.created_at >= cutoff,
            TaskHistory.status == "success"
        ).count()
        tasks_failed = db.query(TaskHistory).filter(
            TaskHistory.created_at >= cutoff,
            TaskHistory.status == "failed"
        ).count()

        # Contagem de métricas e dispositivos únicos
        metrics_total = db.query(DeviceMetric).filter(DeviceMetric.collected_at >= cutoff).count()
        devices_with_metrics = db.query(DeviceMetric.device_id).filter(
            DeviceMetric.collected_at >= cutoff
        ).distinct().count()

        return {
            "success": True,
            "period_hours": hours,
            "alerts": {
                "total": alerts_total,
                "critical": alerts_critical,
                "error": alerts_error,
                "warning": alerts_warning,
                "active": alerts_active,
            },
            "tasks": {
                "total": tasks_total,
                "pending": tasks_pending,
                "success": tasks_success,
                "failed": tasks_failed,
            },
            "metrics": {
                "total": metrics_total,
                "devices_active": devices_with_metrics,
            },
        }
    except Exception as e:
        log.exception(f"Erro gerando resumo de feeds: {e}")
        raise HTTPException(status_code=500, detail=str(e))
