#!/usr/bin/env python3
# app/scripts/device_monitor.py
"""
Script de Monitoramento de Dispositivos.
- Detecta novos dispositivos
- Detecta factory resets
- Executa backup automático de configurações
- Executa restore automático após reset
"""

import asyncio
import httpx
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional, Set

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from app.database import SessionLocal
from app.database.models import Device, DeviceConfigBackup, DeviceBootstrapEvent
from app.services.config_backup_service import ConfigBackupService
from app.settings import settings

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s"
)
log = logging.getLogger("device-monitor")

GENIE_API_URL = settings.GENIE_NBI

# Cache de uptimes anteriores (device_id -> uptime)
_previous_uptimes: Dict[str, int] = {}
# Cache de dispositivos conhecidos
_known_devices: Set[str] = set()
# Intervalo de monitoramento (segundos)
MONITOR_INTERVAL = 60  # 1 minuto
# Intervalo de backup (segundos)
BACKUP_INTERVAL = 300  # 5 minutos
# Threshold de uptime para detectar reset
RESET_UPTIME_THRESHOLD = 600  # 10 minutos


def get_value(obj: Any, path: str, default: Any = None) -> Any:
    """Helper para extrair valores de objetos TR-069."""
    try:
        parts = path.split(".")
        result = obj
        for part in parts:
            if isinstance(result, dict):
                result = result.get(part)
            else:
                result = getattr(result, part, None)
            if result is None:
                return default
        
        if isinstance(result, dict) and "_value" in result:
            return result["_value"]
        
        return result if result is not None else default
    except:
        return default


async def fetch_all_devices(client: httpx.AsyncClient) -> List[Dict]:
    """Busca todos os dispositivos do GenieACS."""
    try:
        response = await client.get(
            f"{GENIE_API_URL}/devices",
            timeout=30.0
        )
        response.raise_for_status()
        return response.json()
    except Exception as e:
        log.error(f"Erro ao buscar dispositivos: {e}")
        return []


async def fetch_device_full(client: httpx.AsyncClient, device_id: str) -> Optional[Dict]:
    """Busca dados completos de um dispositivo via query."""
    import urllib.parse
    try:
        # GenieACS requer query para buscar dispositivo específico
        query = urllib.parse.quote('{"_id":"' + device_id + '"}')
        response = await client.get(
            f"{GENIE_API_URL}/devices?query={query}",
            timeout=30.0
        )
        response.raise_for_status()
        devices = response.json()
        return devices[0] if devices else None
    except Exception as e:
        log.error(f"Erro ao buscar dispositivo {device_id}: {e}")
        return None


def is_device_online(device: Dict) -> bool:
    """Verifica se o dispositivo está online (informou recentemente)."""
    last_inform = device.get("_lastInform")
    if not last_inform:
        return False
    
    try:
        last_dt = datetime.fromisoformat(last_inform.replace("Z", "+00:00"))
        diff_seconds = (datetime.now(last_dt.tzinfo) - last_dt).total_seconds()
        return diff_seconds < 600  # Online se informou nos últimos 10 min
    except:
        return False


def detect_reset(device: Dict, previous_uptime: Optional[int]) -> tuple[bool, str]:
    """
    Detecta se um dispositivo passou por reset.
    Retorna (is_reset, reason)
    """
    device_id = device.get("_id", "")
    serial = get_value(device, "_deviceId._SerialNumber")
    
    # Obter uptime atual
    uptime = get_value(device, "InternetGatewayDevice.DeviceInfo.UpTime") or \
             get_value(device, "Device.DeviceInfo.UpTime")
    
    if uptime is None:
        return False, "no_uptime"
    
    uptime = int(uptime)
    
    # Se temos uptime anterior e o atual é menor, houve reset
    if previous_uptime is not None and uptime < previous_uptime:
        return True, "uptime_decreased"
    
    # Uptime muito baixo em dispositivo que já conhecemos
    if uptime < RESET_UPTIME_THRESHOLD and device_id in _known_devices:
        # Verificar se o SSID está em valor default
        ssid = get_value(device, "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID")
        if ssid and is_default_ssid(ssid, serial):
            return True, "factory_reset_ssid"
        
        # Verificar se perdeu PPPoE
        pppoe = get_value(device, 
            "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Username")
        if not pppoe:
            return True, "pppoe_lost"
    
    return False, "no_reset"


def is_default_ssid(ssid: str, serial: Optional[str]) -> bool:
    """Verifica se o SSID é um valor padrão de fábrica."""
    if not ssid:
        return False
    
    ssid_lower = ssid.lower()
    
    default_patterns = [
        "tp-link", "tplink", "archer", "deco",
        "intelbras", "twibi", "wi-force", "action",
        "zte", "zxhn", "f670", "f680",
        "huawei", "hg8", "eg8", "ont",
        "fiberhome", "an55", "hg6",
        "multilaser", "default", "setup", "wireless"
    ]
    
    for pattern in default_patterns:
        if pattern in ssid_lower:
            return True
    
    if serial and serial.lower() in ssid_lower:
        return True
    
    return False


async def process_device(client: httpx.AsyncClient, device: Dict, backup_service: ConfigBackupService) -> Dict[str, Any]:
    """Processa um dispositivo individual."""
    device_id = device.get("_id", "")
    serial = get_value(device, "_deviceId._SerialNumber", "")
    manufacturer = get_value(device, "_deviceId._Manufacturer", "")
    model = get_value(device, "_deviceId._ProductClass", "")
    
    result = {
        "device_id": device_id,
        "serial": serial,
        "is_new": False,
        "reset_detected": False,
        "action": None
    }
    
    if not device_id or not serial:
        return result
    
    # Verificar se é dispositivo novo
    is_new = device_id not in _known_devices
    
    # Obter uptime atual
    uptime = get_value(device, "InternetGatewayDevice.DeviceInfo.UpTime") or \
             get_value(device, "Device.DeviceInfo.UpTime")
    uptime = int(uptime) if uptime else None
    
    # Verificar reset
    previous_uptime = _previous_uptimes.get(device_id)
    is_reset, reset_reason = detect_reset(device, previous_uptime)
    
    if is_new:
        result["is_new"] = True
        log.info(f"🆕 Novo dispositivo detectado: {serial} ({manufacturer} {model})")
        
        # Verificar se temos backup existente para este serial
        existing_backup = backup_service.get_active_backup(serial)
        
        if existing_backup:
            log.info(f"📦 Backup encontrado para {serial}, tentando restaurar...")
            success = await backup_service.auto_restore_config(device_id, serial)
            result["action"] = "restore_attempted"
            result["restore_success"] = success
        else:
            # Criar backup inicial
            device_full = await fetch_device_full(client, device_id)
            if device_full:
                backup = await backup_service.create_backup(device_id, device_full)
                if backup:
                    result["action"] = "backup_created"
                    log.info(f"💾 Backup inicial criado para {serial}")
        
        _known_devices.add(device_id)
    
    elif is_reset:
        result["reset_detected"] = True
        log.warning(f"🔄 Reset detectado em {serial}: {reset_reason}")
        
        # Tentar restaurar configurações
        success = await backup_service.auto_restore_config(device_id, serial)
        result["action"] = "restore_attempted"
        result["restore_success"] = success
        
        if success:
            log.info(f"✅ Configurações restauradas com sucesso para {serial}")
        else:
            log.error(f"❌ Falha ao restaurar configurações para {serial}")
    
    # Atualizar cache de uptime
    if uptime is not None:
        _previous_uptimes[device_id] = uptime
    
    return result


async def run_backup_cycle(client: httpx.AsyncClient, devices: List[Dict], backup_service: ConfigBackupService):
    """Executa ciclo de backup de configurações."""
    log.info("📦 Iniciando ciclo de backup...")
    
    backup_count = 0
    for device in devices:
        device_id = device.get("_id", "")
        if not device_id or not is_device_online(device):
            continue
        
        try:
            device_full = await fetch_device_full(client, device_id)
            if device_full:
                backup = await backup_service.create_backup(device_id, device_full)
                if backup:
                    backup_count += 1
        except Exception as e:
            log.error(f"Erro ao fazer backup de {device_id}: {e}")
    
    log.info(f"📦 Ciclo de backup concluído: {backup_count} dispositivos")


async def monitor_loop():
    """Loop principal de monitoramento."""
    global _known_devices
    
    log.info("=== Iniciando Monitor de Dispositivos ===")
    log.info(f"GenieACS API: {GENIE_API_URL}")
    log.info(f"Intervalo de monitoramento: {MONITOR_INTERVAL}s")
    log.info(f"Intervalo de backup: {BACKUP_INTERVAL}s")
    
    # Inicializar cache de dispositivos conhecidos do banco
    db = SessionLocal()
    try:
        known = db.query(Device.device_id).all()
        _known_devices = {d[0] for d in known}
        log.info(f"Dispositivos conhecidos carregados: {len(_known_devices)}")
    finally:
        db.close()
    
    last_backup_time = datetime.utcnow()
    
    while True:
        try:
            db = SessionLocal()
            backup_service = ConfigBackupService(db)
            
            async with httpx.AsyncClient(verify=False) as client:
                devices = await fetch_all_devices(client)
                
                if not devices:
                    log.warning("Nenhum dispositivo encontrado")
                    await asyncio.sleep(MONITOR_INTERVAL)
                    continue
                
                log.info(f"Monitorando {len(devices)} dispositivos...")
                
                # Processar cada dispositivo online
                online_count = 0
                new_count = 0
                reset_count = 0
                
                for device in devices:
                    if not is_device_online(device):
                        continue
                    
                    online_count += 1
                    result = await process_device(client, device, backup_service)
                    
                    if result.get("is_new"):
                        new_count += 1
                    if result.get("reset_detected"):
                        reset_count += 1
                
                log.info(f"📊 Online: {online_count} | Novos: {new_count} | Resets: {reset_count}")
                
                # Verificar se é hora do ciclo de backup
                time_since_backup = (datetime.utcnow() - last_backup_time).total_seconds()
                if time_since_backup >= BACKUP_INTERVAL:
                    await run_backup_cycle(client, devices, backup_service)
                    last_backup_time = datetime.utcnow()
            
            db.close()
            
            log.info(f"Aguardando {MONITOR_INTERVAL}s até próximo ciclo...")
            await asyncio.sleep(MONITOR_INTERVAL)
            
        except KeyboardInterrupt:
            log.info("Monitor interrompido pelo usuário")
            break
        except Exception as e:
            log.error(f"Erro no loop de monitoramento: {e}")
            await asyncio.sleep(30)


async def main():
    """Função principal."""
    await monitor_loop()


if __name__ == "__main__":
    asyncio.run(main())
