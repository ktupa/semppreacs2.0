# app/routers/backup_router.py
"""
Router para gerenciamento de backups de configurações de dispositivos.
"""

from __future__ import annotations

from typing import Optional, List
from fastapi import APIRouter, HTTPException, Depends, Query, BackgroundTasks
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from datetime import datetime
import httpx
import logging

from app.database.connection import get_db
from app.database.models import Device, DeviceConfigBackup, DeviceBootstrapEvent
from app.services.config_backup_service import ConfigBackupService
from app.settings import settings

log = logging.getLogger("semppre-bridge.backup")

router = APIRouter(prefix="/backup", tags=["Backup & Restore"])


# ============ Schemas ============

class BackupResponse(BaseModel):
    """Resposta de backup."""
    id: int
    device_id: int
    serial_number: str
    mac_address: Optional[str]
    wifi_config: dict
    wan_config: dict
    lan_config: dict
    is_active: bool
    is_auto_restore_enabled: bool
    restore_count: int
    last_restored_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class BackupSummary(BaseModel):
    """Resumo de backup."""
    id: int
    serial_number: str
    manufacturer: Optional[str]
    model: Optional[str]
    ssid_24ghz: Optional[str]
    ssid_5ghz: Optional[str]
    pppoe_user: Optional[str]
    is_auto_restore_enabled: bool
    restore_count: int
    last_restored_at: Optional[datetime]
    updated_at: datetime


class BootstrapEventResponse(BaseModel):
    """Evento de bootstrap/reset."""
    id: int
    serial_number: str
    genie_device_id: Optional[str]
    event_type: str
    detected_at: datetime
    action_taken: Optional[str]
    restore_status: Optional[str]
    
    class Config:
        from_attributes = True


class RestoreRequest(BaseModel):
    """Request para restauração manual."""
    device_id: str = Field(..., description="ID do dispositivo no GenieACS")
    force: bool = Field(False, description="Forçar restauração mesmo se auto-restore estiver desabilitado")


class BackupConfigRequest(BaseModel):
    """Request para criar backup manual."""
    device_id: str = Field(..., description="ID do dispositivo no GenieACS")


class ToggleAutoRestoreRequest(BaseModel):
    """Request para habilitar/desabilitar auto-restore."""
    serial_number: str = Field(..., description="Número de série do dispositivo")
    enabled: bool = Field(..., description="Habilitar ou desabilitar auto-restore")


# ============ Endpoints ============

@router.get("/list", response_model=List[BackupSummary])
async def list_backups(
    only_active: bool = Query(True, description="Apenas backups ativos"),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db)
):
    """Lista todos os backups de configurações."""
    service = ConfigBackupService(db)
    backups = service.list_backups(limit=limit, only_active=only_active)
    
    result = []
    for backup in backups:
        # Buscar info do dispositivo
        device = db.query(Device).filter(Device.id == backup.device_id).first()
        
        result.append(BackupSummary(
            id=backup.id,
            serial_number=backup.serial_number,
            manufacturer=device.manufacturer if device else None,
            model=device.product_class if device else None,
            ssid_24ghz=backup.wifi_config.get("2.4GHz", {}).get("ssid") if backup.wifi_config else None,
            ssid_5ghz=backup.wifi_config.get("5GHz", {}).get("ssid") if backup.wifi_config else None,
            pppoe_user=backup.wan_config.get("pppoe", {}).get("username") if backup.wan_config else None,
            is_auto_restore_enabled=backup.is_auto_restore_enabled,
            restore_count=backup.restore_count,
            last_restored_at=backup.last_restored_at,
            updated_at=backup.updated_at
        ))
    
    return result


@router.get("/device/{device_id}", response_model=BackupResponse)
async def get_device_backup(
    device_id: str,
    db: Session = Depends(get_db)
):
    """Obtém backup de um dispositivo específico."""
    service = ConfigBackupService(db)
    backup = service.get_backup_by_device(device_id)
    
    if not backup:
        raise HTTPException(status_code=404, detail="Backup não encontrado para este dispositivo")
    
    return backup


@router.get("/serial/{serial_number}", response_model=BackupResponse)
async def get_backup_by_serial(
    serial_number: str,
    db: Session = Depends(get_db)
):
    """Obtém backup pelo número de série."""
    service = ConfigBackupService(db)
    backup = service.get_active_backup(serial_number)
    
    if not backup:
        raise HTTPException(status_code=404, detail="Backup não encontrado para este serial")
    
    return backup


@router.post("/create")
async def create_backup(
    request: BackupConfigRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """Cria backup manual de um dispositivo."""
    service = ConfigBackupService(db)
    
    # Buscar dados completos do dispositivo no GenieACS
    try:
        async with httpx.AsyncClient(timeout=30, verify=False) as client:
            url = f"{settings.GENIE_NBI.rstrip('/')}/devices/{request.device_id}"
            resp = await client.get(url)
            
            if resp.status_code != 200:
                raise HTTPException(status_code=404, detail="Dispositivo não encontrado no GenieACS")
            
            device_data = resp.json()
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Erro ao comunicar com GenieACS: {e}")
    
    # Criar backup
    backup = await service.create_backup(request.device_id, device_data)
    
    if not backup:
        raise HTTPException(status_code=400, detail="Não foi possível criar backup. Verifique se o dispositivo tem configurações válidas.")
    
    return {
        "success": True,
        "message": "Backup criado com sucesso",
        "backup_id": backup.id,
        "serial_number": backup.serial_number
    }


@router.post("/restore")
async def restore_config(
    request: RestoreRequest,
    db: Session = Depends(get_db)
):
    """Restaura configurações de um dispositivo manualmente."""
    service = ConfigBackupService(db)
    
    # Buscar dispositivo
    device = db.query(Device).filter(Device.device_id == request.device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Dispositivo não encontrado")
    
    # Buscar backup
    backup = service.get_backup_by_device(request.device_id)
    if not backup:
        # Tentar pelo serial
        if device.serial_number:
            backup = service.get_active_backup(device.serial_number)
    
    if not backup:
        raise HTTPException(status_code=404, detail="Nenhum backup encontrado para este dispositivo")
    
    if not backup.is_auto_restore_enabled and not request.force:
        raise HTTPException(
            status_code=400, 
            detail="Auto-restore está desabilitado. Use force=true para forçar."
        )
    
    # Executar restore
    success = await service.auto_restore_config(request.device_id, backup.serial_number)
    
    if not success:
        raise HTTPException(status_code=500, detail="Falha ao restaurar configurações")
    
    return {
        "success": True,
        "message": "Restauração iniciada com sucesso",
        "device_id": request.device_id,
        "serial_number": backup.serial_number
    }


@router.post("/toggle-auto-restore")
async def toggle_auto_restore(
    request: ToggleAutoRestoreRequest,
    db: Session = Depends(get_db)
):
    """Habilita ou desabilita auto-restore para um dispositivo."""
    service = ConfigBackupService(db)
    
    success = service.toggle_auto_restore(request.serial_number, request.enabled)
    
    if not success:
        raise HTTPException(status_code=404, detail="Backup não encontrado para este serial")
    
    return {
        "success": True,
        "serial_number": request.serial_number,
        "auto_restore_enabled": request.enabled
    }


@router.get("/events", response_model=List[BootstrapEventResponse])
async def list_bootstrap_events(
    device_id: Optional[str] = Query(None, description="Filtrar por device_id"),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db)
):
    """Lista eventos de bootstrap/reset detectados."""
    service = ConfigBackupService(db)
    events = service.list_bootstrap_events(device_id=device_id, limit=limit)
    return events


@router.get("/stats")
async def backup_stats(db: Session = Depends(get_db)):
    """Estatísticas de backup e restore."""
    total_backups = db.query(DeviceConfigBackup).filter(DeviceConfigBackup.is_active == True).count()
    total_restores = db.query(DeviceConfigBackup).filter(DeviceConfigBackup.restore_count > 0).count()
    
    # Soma total de restores
    from sqlalchemy import func
    total_restore_count = db.query(func.sum(DeviceConfigBackup.restore_count)).scalar() or 0
    
    # Eventos recentes
    recent_events = db.query(DeviceBootstrapEvent).order_by(
        DeviceBootstrapEvent.detected_at.desc()
    ).limit(10).all()
    
    # Backups com auto-restore habilitado
    auto_restore_enabled = db.query(DeviceConfigBackup).filter(
        DeviceConfigBackup.is_active == True,
        DeviceConfigBackup.is_auto_restore_enabled == True
    ).count()
    
    return {
        "total_backups": total_backups,
        "total_devices_restored": total_restores,
        "total_restore_operations": total_restore_count,
        "auto_restore_enabled_count": auto_restore_enabled,
        "recent_events": [
            {
                "serial": e.serial_number,
                "event_type": e.event_type,
                "detected_at": e.detected_at.isoformat() if e.detected_at else None,
                "status": e.restore_status
            }
            for e in recent_events
        ]
    }


@router.delete("/device/{device_id}")
async def delete_device_backup(
    device_id: str,
    db: Session = Depends(get_db)
):
    """Remove backup de um dispositivo."""
    device = db.query(Device).filter(Device.device_id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Dispositivo não encontrado")
    
    backup = db.query(DeviceConfigBackup).filter(
        DeviceConfigBackup.device_id == device.id,
        DeviceConfigBackup.is_active == True
    ).first()
    
    if not backup:
        raise HTTPException(status_code=404, detail="Backup não encontrado")
    
    backup.is_active = False
    db.commit()
    
    return {
        "success": True,
        "message": "Backup desativado com sucesso"
    }
