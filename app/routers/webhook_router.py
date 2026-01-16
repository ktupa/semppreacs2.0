# app/routers/webhook_router.py
"""
Router para receber webhooks/alerts externos (ex.: notifications, integrations)

Endpoints:
- POST /webhook/alert : Ingest de alertas externos, valida e persiste em AlertEvent
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Dict, Any, Optional

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database.connection import get_db
from app.database.models import Device, AlertEvent
from app.ml import learning_engine

log = logging.getLogger("semppre-bridge.webhook")

router = APIRouter(prefix="/webhook", tags=["Webhooks"])


@router.post("/alert")
async def receive_alert(payload: Dict[str, Any] = Body(...), db: Session = Depends(get_db)):
    """Recebe alerta de sistema externo e persiste em AlertEvent.
    payload esperado: device_id (opcional), severity, category, title, message, details
    """
    try:
        severity = payload.get("severity", "info")
        category = payload.get("category", "general")
        title = payload.get("title") or payload.get("event") or "Alerta recebido"
        message = payload.get("message") or payload.get("body") or ""
        details = payload.get("details") or payload.get("data") or {}

        device_id_external = payload.get("device_id")
        device = None
        device_fk = None
        if device_id_external:
            device = db.query(Device).filter(Device.device_id == device_id_external).first()
            if device:
                device_fk = device.id
            else:
                # não abortar se device desconhecido; apenas persistir sem device
                device_fk = None

        alert = AlertEvent(
            device_id=device_fk,
            severity=severity,
            category=category,
            title=title,
            message=message,
            details=details,
        )
        db.add(alert)
        db.commit()
        db.refresh(alert)

        # Registrar feedback/learning se houver campo 'feedback'
        fb = payload.get("feedback")
        if fb in ("positive", "negative", "neutral"):
            try:
                learning_engine.record_feedback("external_alert", device_id_external, fb, {"alert_id": alert.id})
            except Exception:
                log.warning("learning_engine.record_feedback falhou")

        return {"success": True, "alert_id": alert.id}
    except Exception as e:
        log.exception(f"Erro recebendo webhook alert: {e}")
        raise HTTPException(status_code=500, detail=str(e))
