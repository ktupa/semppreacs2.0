# app/routers/config_router.py
"""
Router para configurações do sistema, incluindo Periodic Inform.
"""
from __future__ import annotations

from typing import Optional, Dict, List
from fastapi import APIRouter, HTTPException, BackgroundTasks, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
import httpx
import asyncio
import logging
from datetime import datetime, timedelta
import time

from app.settings import settings
from app.database.connection import get_db
from app.database import models as db_models

log = logging.getLogger("semppre-bridge.config")

router = APIRouter(prefix="/config", tags=["Configuração"])

# Estado global do periodic inform (em produção, usar Redis ou DB)
_periodic_inform_state = {
    "enabled": False,
    "interval_minutes": 15,
    "last_run": None,
    "next_run": None,
    "running": False,
    "task": None,
    "devices_count": 0,
    "success_count": 0,
    "fail_count": 0,
    # store last run details
    "last_errors": [],  # list of {device_id, status, body, error}
    "last_summary": None,
}


class PeriodicInformConfig(BaseModel):
    """Configuração do Periodic Inform"""
    enabled: bool = Field(False, description="Ativa/desativa o inform periódico")
    interval_minutes: int = Field(15, ge=5, le=1440, description="Intervalo em minutos (5-1440)")


class PeriodicInformStatus(BaseModel):
    """Status atual do Periodic Inform"""
    enabled: bool
    interval_minutes: int
    running: bool
    last_run: Optional[str]
    next_run: Optional[str]
    devices_count: int
    success_count: int
    fail_count: int


async def _get_all_devices(manufacturer: Optional[str] = None) -> List[Dict]:
    """Busca todos os dispositivos do GenieACS. Se 'manufacturer' for fornecido,
    filtra os dispositivos cujo _Manufacturer contém a string (case-insensitive).
    """
    try:
        url = f"{settings.GENIE_NBI.rstrip('/')}/devices"
        async with httpx.AsyncClient(timeout=30, verify=False) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                devices = resp.json()
                if manufacturer:
                    m = manufacturer.lower()
                    filtered = []
                    for d in devices:
                        dev_id = d.get("_deviceId", {})
                        manu = str(dev_id.get("_Manufacturer", "")).lower()
                        if m in manu:
                            filtered.append(d)
                    return filtered
                return devices
            else:
                log.error(f"Erro ao buscar dispositivos NBI: status={resp.status_code} body={resp.text}")
    except Exception as e:
        log.error(f"Erro ao buscar dispositivos: {e}")
    return []


async def _send_connection_request(device_id: str) -> tuple[bool, int | None, str | None]:
    """Envia Connection Request para um dispositivo específico."""
    try:
        url = f"{settings.GENIE_NBI.rstrip('/')}/devices/{device_id}/tasks"
        payload = {"name": "refreshObject", "objectName": ""}
        
        async with httpx.AsyncClient(timeout=30, verify=False) as client:
            resp = await client.post(url, json=payload, params={"connection_request": ""})
            status = resp.status_code
            body = resp.text if resp is not None else None
            if status in (200, 202):
                log.info(f"Connection request enviado para: {device_id}")
                return True, status, body
            else:
                # Log detalhado para facilitar diagnóstico (body pode conter info)
                log.warning(
                    f"Falha ao enviar connection request para {device_id}: {status} body={body}"
                )
                return False, status, body
    except Exception as e:
        log.error(f"Erro ao enviar connection request para {device_id}: {e}")
        return False, None, str(e)


async def _run_periodic_inform(manufacturer: Optional[str] = None):
    """Executa o inform periódico em todos os dispositivos."""
    global _periodic_inform_state
    
    if _periodic_inform_state["running"]:
        log.warning("Periodic inform já está em execução")
        return
    
    _periodic_inform_state["running"] = True
    _periodic_inform_state["last_run"] = datetime.now().isoformat()
    _periodic_inform_state["success_count"] = 0
    _periodic_inform_state["fail_count"] = 0
    
    try:
        devices = await _get_all_devices(manufacturer)
        _periodic_inform_state["devices_count"] = len(devices)
        # reset last errors for this run
        last_errors: List[Dict] = []

        log.info(f"Iniciando periodic inform para {len(devices)} dispositivos")

        # Envia connection request para cada dispositivo com delay
        for device in devices:
            device_id = device.get("_id")
            if not device_id:
                continue

            try:
                success, status, body = await _send_connection_request(device_id)
                if success:
                    _periodic_inform_state["success_count"] += 1
                else:
                    _periodic_inform_state["fail_count"] += 1
                    last_errors.append({
                        "device_id": device_id,
                        "status": status,
                        "body": body,
                    })
            except Exception as e:
                log.exception(f"Erro ao processar device {device_id}: {e}")
                _periodic_inform_state["fail_count"] += 1
                last_errors.append({
                    "device_id": device_id,
                    "status": None,
                    "body": str(e),
                })

            # Pequeno delay para não sobrecarregar
            await asyncio.sleep(0.1)
        
        log.info(
            f"Periodic inform concluído: {_periodic_inform_state['success_count']} sucesso, "
            f"{_periodic_inform_state['fail_count']} falha"
        )
        # store last summary and errors
        finished_at = datetime.now().isoformat()
        _periodic_inform_state["last_errors"] = last_errors
        _periodic_inform_state["last_summary"] = {
            "started_at": _periodic_inform_state.get("last_run"),
            "finished_at": finished_at,
            "devices_count": _periodic_inform_state.get("devices_count"),
            "success_count": _periodic_inform_state.get("success_count"),
            "fail_count": _periodic_inform_state.get("fail_count"),
            "errors": last_errors,
            "manufacturer_filter": manufacturer,
        }
        
    except Exception as e:
        log.exception(f"Erro no periodic inform: {e}")
    finally:
        _periodic_inform_state["running"] = False
        
        # Calcula próxima execução
        if _periodic_inform_state["enabled"]:
            next_run = datetime.now() + timedelta(minutes=_periodic_inform_state["interval_minutes"])
            _periodic_inform_state["next_run"] = next_run.isoformat()


async def _periodic_inform_loop():
    """Loop contínuo do periodic inform."""
    global _periodic_inform_state
    
    while _periodic_inform_state["enabled"]:
        await _run_periodic_inform()
        
        if not _periodic_inform_state["enabled"]:
            break
            
        # Aguarda o intervalo configurado
        interval_seconds = _periodic_inform_state["interval_minutes"] * 60
        log.info(f"Próximo periodic inform em {_periodic_inform_state['interval_minutes']} minutos")
        
        # Divide em intervalos menores para poder parar rapidamente
        for _ in range(interval_seconds):
            if not _periodic_inform_state["enabled"]:
                break
            await asyncio.sleep(1)
    
    log.info("Periodic inform loop encerrado")
    _periodic_inform_state["task"] = None


@router.get("/periodic-inform", response_model=PeriodicInformStatus)
async def get_periodic_inform_status():
    """Retorna o status atual do Periodic Inform."""
    return PeriodicInformStatus(
        enabled=_periodic_inform_state["enabled"],
        interval_minutes=_periodic_inform_state["interval_minutes"],
        running=_periodic_inform_state["running"],
        last_run=_periodic_inform_state["last_run"],
        next_run=_periodic_inform_state["next_run"],
        devices_count=_periodic_inform_state["devices_count"],
        success_count=_periodic_inform_state["success_count"],
        fail_count=_periodic_inform_state["fail_count"],
    )


@router.post("/periodic-inform", response_model=PeriodicInformStatus)
async def configure_periodic_inform(config: PeriodicInformConfig, background_tasks: BackgroundTasks):
    """Configura e inicia/para o Periodic Inform."""
    global _periodic_inform_state
    
    old_enabled = _periodic_inform_state["enabled"]
    _periodic_inform_state["enabled"] = config.enabled
    _periodic_inform_state["interval_minutes"] = config.interval_minutes
    
    if config.enabled and not old_enabled:
        # Inicia o loop em background
        log.info(f"Iniciando periodic inform com intervalo de {config.interval_minutes} minutos")
        
        # Cancela task anterior se existir
        if _periodic_inform_state["task"]:
            try:
                _periodic_inform_state["task"].cancel()
            except Exception:
                pass
        
        # Cria nova task
        _periodic_inform_state["task"] = asyncio.create_task(_periodic_inform_loop())
        
        next_run = datetime.now() + timedelta(seconds=5)  # Primeira execução em 5s
        _periodic_inform_state["next_run"] = next_run.isoformat()
        
    elif not config.enabled and old_enabled:
        # Para o loop
        log.info("Parando periodic inform")
        _periodic_inform_state["next_run"] = None
        
        if _periodic_inform_state["task"]:
            try:
                _periodic_inform_state["task"].cancel()
            except Exception:
                pass
            _periodic_inform_state["task"] = None
    
    return PeriodicInformStatus(
        enabled=_periodic_inform_state["enabled"],
        interval_minutes=_periodic_inform_state["interval_minutes"],
        running=_periodic_inform_state["running"],
        last_run=_periodic_inform_state["last_run"],
        next_run=_periodic_inform_state["next_run"],
        devices_count=_periodic_inform_state["devices_count"],
        success_count=_periodic_inform_state["success_count"],
        fail_count=_periodic_inform_state["fail_count"],
    )


@router.post("/periodic-inform/run-now")
async def run_periodic_inform_now(
    manufacturer: Optional[str] = None,
    wait: bool = False,
    wait_timeout: int = 300,
):
    """Executa o Periodic Inform imediatamente (uma vez).

    Behavior:
    - If a run is already in progress and wait=False -> returns 409.
    - If a run is already in progress and wait=True -> attach and wait (up to wait_timeout seconds) for it to finish and return the summary.
    - If no run is in progress and wait=True -> execute synchronously and return the summary.
    - If no run is in progress and wait=False -> start background run and return started status.
    """
    # If a run is active
    if _periodic_inform_state["running"]:
        if not wait:
            raise HTTPException(status_code=409, detail="Periodic Inform já está em execução")

        # wait for the active run to finish (attach)
        start = time.time()
        log.info("run-now called with wait=true; attaching to running periodic inform")
        while _periodic_inform_state["running"]:
            if time.time() - start > wait_timeout:
                raise HTTPException(status_code=504, detail="Timeout waiting for periodic inform to finish")
            await asyncio.sleep(1)

        # now finished; return last summary (if any)
        return _periodic_inform_state.get("last_summary") or {"status": "no_summary"}

    # No run active
    if wait:
        # Executa de forma síncrona e retorna o resumo ao final
        await _run_periodic_inform(manufacturer)
        return _periodic_inform_state.get("last_summary") or {"status": "no_summary"}
    else:
        asyncio.create_task(_run_periodic_inform(manufacturer))
        return {
            "status": "started",
            "message": "Periodic Inform iniciado em background",
            "manufacturer_filter": manufacturer,
        }


@router.get("/periodic-inform/result")
async def get_periodic_inform_result():
    """Retorna o resumo detalhado da última execução do Periodic Inform."""
    summary = _periodic_inform_state.get("last_summary")
    if not summary:
        raise HTTPException(status_code=404, detail="No periodic inform summary available")
    return summary


# ========== CONFIGURAÇÕES GERAIS ==========

class SystemConfig(BaseModel):
    """Configurações gerais do sistema"""
    acs_url: str = Field(..., description="URL do ACS (GenieACS)")
    metrics_collection_interval: int = Field(60, ge=10, le=3600, description="Intervalo de coleta de métricas (segundos)")
    metrics_retention_days: int = Field(30, ge=1, le=365, description="Dias de retenção de métricas")


@router.get("/system")
async def get_system_config():
    """Retorna configurações do sistema."""
    return {
        "acs_url": settings.GENIE_NBI,
        "acs_fs_url": settings.GENIE_FS,
        "ixc_enabled": bool(getattr(settings, "IXC_BASE_URL", "")),
        "ixc_base_url": getattr(settings, "IXC_BASE_URL", ""),
    }


@router.get("/stats")
async def get_system_stats():
    """Retorna estatísticas do sistema."""
    try:
        devices = await _get_all_devices()
        
        # Conta dispositivos online (lastInform < 5 minutos)
        now = datetime.now()
        online_count = 0
        
        for device in devices:
            last_inform = device.get("_lastInform")
            if last_inform:
                try:
                    # Parse ISO date
                    if isinstance(last_inform, str):
                        last_dt = datetime.fromisoformat(last_inform.replace("Z", "+00:00").replace("+00:00", ""))
                    else:
                        last_dt = last_inform
                    
                    diff = now - last_dt.replace(tzinfo=None)
                    if diff.total_seconds() < 300:  # 5 minutos
                        online_count += 1
                except Exception:
                    pass
        
        return {
            "total_devices": len(devices),
            "online_devices": online_count,
            "offline_devices": len(devices) - online_count,
            "periodic_inform_enabled": _periodic_inform_state["enabled"],
            "last_inform_run": _periodic_inform_state["last_run"],
        }
    except Exception as e:
        log.exception(f"Erro ao buscar stats: {e}")
        return {
            "total_devices": 0,
            "online_devices": 0,
            "offline_devices": 0,
            "periodic_inform_enabled": _periodic_inform_state["enabled"],
            "last_inform_run": _periodic_inform_state["last_run"],
        }


# ========== OpenAI Key management (store in SystemConfig) ==========


class OpenAIKeyIn(BaseModel):
    api_key: str


@router.get("/openai")
async def get_openai_config(db: Session = Depends(get_db)):
    """Retorna informação se a chave OpenAI está configurada (masked)."""
    try:
        rec = db.query(db_models.SystemConfig).filter_by(key="openai_api_key").first()
        has_key = bool(rec and rec.value)
        masked = None
        if has_key:
            v = rec.value
            if len(v) > 8:
                masked = f"{v[:4]}{'*'*(len(v)-8)}{v[-4:]}"
            else:
                masked = "****"
        # attempt to list models using the stored key
        models = None
        try:
            if has_key:
                url = f"{settings.OPENAI_API_BASE.rstrip('/')}/v1/models"
                headers = {"Authorization": f"Bearer {rec.value}", "Content-Type": "application/json"}
                async with httpx.AsyncClient(timeout=30.0) as client:
                    resp = await client.get(url, headers=headers)
                if resp.status_code == 200:
                    data = resp.json()
                    models = [m.get("id") for m in data.get("data", []) if isinstance(m, dict) and m.get("id")]
        except Exception:
            models = None

        return {"has_key": has_key, "masked": masked, "models": models}
    except Exception:
        return {"has_key": False, "masked": None, "models": None}


@router.put("/openai")
async def set_openai_key(payload: OpenAIKeyIn, db: Session = Depends(get_db)):
    """Armazena/atualiza a chave OpenAI no banco (SystemConfig).

    Nota: chave é armazenada em texto simples no campo value. Em produção
    considerar criptografia/segredos gerenciados.
    """
    key = (payload.api_key or "").strip()
    if not key:
        raise HTTPException(status_code=400, detail="api_key is required")

    rec = db.query(db_models.SystemConfig).filter_by(key="openai_api_key").first()
    if rec:
        rec.value = key
    else:
        rec = db_models.SystemConfig(key="openai_api_key", value=key)
        db.add(rec)
    db.commit()

    # Atualiza a configuração em memória para uso imediato
    try:
        settings.OPENAI_API_KEY = key
    except Exception:
        pass

    if len(key) > 8:
        masked = f"{key[:4]}{'*'*(len(key)-8)}{key[-4:]}"
    else:
        masked = "****"

    # Try to list models immediately with the saved key and return them to the client
    models = None
    try:
        url = f"{settings.OPENAI_API_BASE.rstrip('/')}/v1/models"
        headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(url, headers=headers)
        if resp.status_code == 200:
            data = resp.json()
            models = [m.get("id") for m in data.get("data", []) if isinstance(m, dict) and m.get("id")]
    except Exception:
        models = None

    return {"status": "ok", "masked": masked, "models": models}


@router.delete("/openai")
async def delete_openai_key(db: Session = Depends(get_db)):
    """Remove a chave OpenAI do banco e da configuração em memória."""
    rec = db.query(db_models.SystemConfig).filter_by(key="openai_api_key").first()
    if rec:
        db.delete(rec)
        db.commit()

    try:
        settings.OPENAI_API_KEY = None
    except Exception:
        pass

    return {"status": "deleted"}


# ========== OpenAI Model selection ==========


class OpenAIModelIn(BaseModel):
    model: str


@router.get("/openai/model")
async def get_openai_model(db: Session = Depends(get_db)):
    """Retorna o modelo OpenAI atualmente salvo nas configurações (se houver)."""
    try:
        rec = db.query(db_models.SystemConfig).filter_by(key="openai_model").first()
        model = rec.value if rec and rec.value else settings.OPENAI_MODEL
        return {"model": model}
    except Exception:
        return {"model": settings.OPENAI_MODEL}


@router.put("/openai/model")
async def set_openai_model(payload: OpenAIModelIn, db: Session = Depends(get_db)):
    """Salva o modelo OpenAI escolhido nas configurações (SystemConfig) e atualiza runtime."""
    model = (payload.model or "").strip()

    rec = db.query(db_models.SystemConfig).filter_by(key="openai_model").first()
    if not model:
        # empty = reset to default -> delete stored config if exists
        if rec:
            db.delete(rec)
            db.commit()
        # reset runtime to env/default
        try:
            import os
            settings.OPENAI_MODEL = os.getenv("OPENAI_MODEL", settings.OPENAI_MODEL)
        except Exception:
            pass
        return {"status": "ok", "model": settings.OPENAI_MODEL}

    # persist provided model
    if rec:
        rec.value = model
    else:
        rec = db_models.SystemConfig(key="openai_model", value=model)
        db.add(rec)
    db.commit()

    # Update runtime setting
    try:
        settings.OPENAI_MODEL = model
    except Exception:
        pass

    return {"status": "ok", "model": model}


# ========== OpenAI per-feature configuration ==========


class OpenAIFeatureConfig(BaseModel):
    enabled: bool = Field(False)
    model: Optional[str] = Field(None)


@router.get("/openai/features")
async def get_openai_features(db: Session = Depends(get_db)):
    """Retorna configurações por feature (enabled + model)."""
    features = ["general", "device", "lan", "wan", "diagnostics"]
    out = {}
    for f in features:
        enabled_rec = db.query(db_models.SystemConfig).filter_by(key=f"openai_enabled_{f}").first()
        model_rec = db.query(db_models.SystemConfig).filter_by(key=f"openai_model_{f}").first()
        out[f] = {
            "enabled": bool(enabled_rec and enabled_rec.value == "1"),
            "model": model_rec.value if model_rec and model_rec.value else None,
        }
    return out


@router.put("/openai/features/{feature}")
async def set_openai_feature(feature: str, payload: OpenAIFeatureConfig, db: Session = Depends(get_db)):
    """Salva a configuração de uma feature (enabled, model)."""
    feature = feature.lower()
    if feature not in ("general", "device", "lan", "wan", "diagnostics"):
        raise HTTPException(status_code=400, detail="Unknown feature")

    # enabled stored as '1' or '0'
    en_key = f"openai_enabled_{feature}"
    en_rec = db.query(db_models.SystemConfig).filter_by(key=en_key).first()
    if en_rec:
        en_rec.value = "1" if payload.enabled else "0"
    else:
        en_rec = db_models.SystemConfig(key=en_key, value=("1" if payload.enabled else "0"))
        db.add(en_rec)

    # model
    m_key = f"openai_model_{feature}"
    m_rec = db.query(db_models.SystemConfig).filter_by(key=m_key).first()
    if payload.model:
        if m_rec:
            m_rec.value = payload.model
        else:
            m_rec = db_models.SystemConfig(key=m_key, value=payload.model)
            db.add(m_rec)
    else:
        # empty model -> delete stored model if exists
        if m_rec:
            db.delete(m_rec)

    db.commit()
    return {"status": "ok", "feature": feature, "enabled": payload.enabled, "model": payload.model}
