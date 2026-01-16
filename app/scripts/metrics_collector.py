#!/usr/bin/env python3
# app/scripts/metrics_collector.py
# Script de coleta periódica de métricas dos dispositivos GenieACS

import asyncio
import httpx
import logging
from datetime import datetime
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session

# Importações do projeto
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from app.database import SessionLocal, Device
from app.services.metrics_service import MetricsService
from app.settings import settings

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s"
)
log = logging.getLogger("metrics-collector")

GENIE_API_URL = settings.GENIE_NBI  # GenieACS NBI (Northbound Interface)


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
        
        # Se tem _value, retorna o valor interno
        if isinstance(result, dict) and "_value" in result:
            return result["_value"]
        
        return result if result is not None else default
    except:
        return default


async def fetch_devices(client: httpx.AsyncClient) -> List[Dict]:
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


def extract_device_info(device: Dict) -> Dict[str, Any]:
    """Extrai informações básicas do dispositivo."""
    device_id = device.get("_id", "")
    
    # Identificação
    serial = get_value(device, "_deviceId._SerialNumber", "")
    manufacturer = get_value(device, "_deviceId._Manufacturer", "")
    product_class = get_value(device, "_deviceId._ProductClass", "")
    oui = get_value(device, "_deviceId._OUI", "")
    
    # Tags
    tags = device.get("_tags", [])
    tag = tags[0] if tags else None
    
    # Status
    last_inform = device.get("_lastInform")
    is_online = False
    if last_inform:
        try:
            last_dt = datetime.fromisoformat(last_inform.replace("Z", "+00:00"))
            diff_seconds = (datetime.now(last_dt.tzinfo) - last_dt).total_seconds()
            is_online = diff_seconds < 600  # Online se informou nos últimos 10 min
        except:
            pass
    
    # PPPoE Login (TR-098 e TR-181)
    pppoe_login = (
        get_value(device, "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Username") or
        get_value(device, "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.2.Username") or  # ZTE
        get_value(device, "Device.PPP.Interface.1.Username") or
        get_value(device, "Device.PPP.Interface.2.Username")  # Zyxel TR-181
    )
    
    # WAN IP (TR-098 e TR-181)
    wan_ip = (
        get_value(device, "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.ExternalIPAddress") or
        get_value(device, "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.2.ExternalIPAddress") or  # ZTE
        get_value(device, "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.ExternalIPAddress") or
        get_value(device, "Device.PPP.Interface.1.IPCP.LocalIPAddress") or  # TR-181
        get_value(device, "Device.PPP.Interface.2.IPCP.LocalIPAddress") or  # Zyxel TR-181
        get_value(device, "Device.IP.Interface.1.IPv4Address.1.IPAddress") or  # TR-181
        get_value(device, "Device.IP.Interface.3.IPv4Address.1.IPAddress")  # Zyxel/TP-Link TR-181
    )
    
    # SSIDs (TR-098 e TR-181)
    ssid_24 = (
        get_value(device, "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID") or
        get_value(device, "Device.WiFi.SSID.1.SSID")  # TR-181
    )
    ssid_5 = (
        get_value(device, "InternetGatewayDevice.LANDevice.1.WLANConfiguration.2.SSID") or  # TP-Link
        get_value(device, "InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.SSID") or  # ZTE/Huawei
        get_value(device, "Device.WiFi.SSID.2.SSID") or  # TR-181
        get_value(device, "Device.WiFi.SSID.3.SSID")  # Zyxel TR-181
    )
    
    # Firmware (TR-098 e TR-181)
    firmware = get_value(device, "InternetGatewayDevice.DeviceInfo.SoftwareVersion") or \
               get_value(device, "InternetGatewayDevice.DeviceInfo.FirmwareVersion") or \
               get_value(device, "Device.DeviceInfo.SoftwareVersion")
    
    hardware = get_value(device, "InternetGatewayDevice.DeviceInfo.HardwareVersion") or \
               get_value(device, "InternetGatewayDevice.DeviceInfo.ModelName") or \
               get_value(device, "Device.DeviceInfo.HardwareVersion") or \
               get_value(device, "Device.DeviceInfo.ModelName")
    
    # WiFi Enabled (TR-098 e TR-181)
    wifi_en = (
        get_value(device, "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.Enable") or
        get_value(device, "Device.WiFi.SSID.1.Enable") or
        get_value(device, "Device.WiFi.Radio.1.Enable")
    )
    if wifi_en is None:
        wifi_en = True
    if isinstance(wifi_en, dict):
        wifi_en = True  # Default se vier objeto
    
    return {
        "device_id": device_id,
        "serial_number": serial,
        "manufacturer": manufacturer,
        "product_class": product_class,
        "oui": oui,
        "pppoe_login": pppoe_login,
        "tag": tag,
        "is_online": is_online,
        "last_inform": datetime.fromisoformat(last_inform.replace("Z", "+00:00")) if last_inform else None,
        "wan_ip": wan_ip,
        "ssid_24ghz": ssid_24,
        "ssid_5ghz": ssid_5,
        "firmware_version": firmware,
        "hardware_version": hardware,
        "wifi_enabled": bool(wifi_en) if wifi_en is not None else True
    }


def extract_metrics(device: Dict) -> Dict[str, Any]:
    """Extrai métricas do dispositivo."""
    
    # Tráfego WAN (TR-098)
    bytes_rx = get_value(device, "InternetGatewayDevice.WANDevice.1.WANCommonInterfaceConfig.TotalBytesReceived", 0)
    bytes_tx = get_value(device, "InternetGatewayDevice.WANDevice.1.WANCommonInterfaceConfig.TotalBytesSent", 0)
    packets_rx = get_value(device, "InternetGatewayDevice.WANDevice.1.WANCommonInterfaceConfig.TotalPacketsReceived", 0)
    packets_tx = get_value(device, "InternetGatewayDevice.WANDevice.1.WANCommonInterfaceConfig.TotalPacketsSent", 0)
    
    # Alternativa TR-181 (múltiplas interfaces possíveis)
    if bytes_rx == 0:
        bytes_rx = (
            get_value(device, "Device.Ethernet.Interface.1.Stats.BytesReceived", 0) or
            get_value(device, "Device.Ethernet.Interface.2.Stats.BytesReceived", 0) or
            get_value(device, "Device.IP.Interface.3.Stats.BytesReceived", 0)  # Zyxel
        )
        bytes_tx = (
            get_value(device, "Device.Ethernet.Interface.1.Stats.BytesSent", 0) or
            get_value(device, "Device.Ethernet.Interface.2.Stats.BytesSent", 0) or
            get_value(device, "Device.IP.Interface.3.Stats.BytesSent", 0)  # Zyxel
        )
    
    # Clientes WiFi (TR-098 e TR-181)
    wifi_24_clients = (
        get_value(device, "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.TotalAssociations", 0) or
        get_value(device, "Device.WiFi.AccessPoint.1.AssociatedDeviceNumberOfEntries", 0)  # TR-181
    )
    wifi_5_clients = (
        get_value(device, "InternetGatewayDevice.LANDevice.1.WLANConfiguration.2.TotalAssociations", 0) or  # TP-Link
        get_value(device, "InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.TotalAssociations", 0) or  # ZTE
        get_value(device, "Device.WiFi.AccessPoint.2.AssociatedDeviceNumberOfEntries", 0) or  # TR-181
        get_value(device, "Device.WiFi.AccessPoint.3.AssociatedDeviceNumberOfEntries", 0)  # Zyxel TR-181
    )
    
    # Canais (TR-098 e TR-181)
    channel_24 = (
        get_value(device, "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.Channel", 0) or
        get_value(device, "Device.WiFi.Radio.1.Channel", 0)  # TR-181
    )
    channel_5 = (
        get_value(device, "InternetGatewayDevice.LANDevice.1.WLANConfiguration.2.Channel", 0) or  # TP-Link
        get_value(device, "InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.Channel", 0) or  # ZTE
        get_value(device, "Device.WiFi.Radio.2.Channel", 0) or  # TR-181
        get_value(device, "Device.WiFi.Radio.3.Channel", 0)  # Zyxel TR-181
    )
    
    # Sistema (TR-098 e TR-181)
    cpu_usage = (
        get_value(device, "InternetGatewayDevice.DeviceInfo.ProcessStatus.CPUUsage") or
        get_value(device, "Device.DeviceInfo.ProcessStatus.CPUUsage")  # TR-181
    )
    memory_total = (
        get_value(device, "InternetGatewayDevice.DeviceInfo.MemoryStatus.Total", 0) or
        get_value(device, "Device.DeviceInfo.MemoryStatus.Total", 0)  # TR-181
    )
    memory_free = (
        get_value(device, "InternetGatewayDevice.DeviceInfo.MemoryStatus.Free", 0) or
        get_value(device, "Device.DeviceInfo.MemoryStatus.Free", 0)  # TR-181
    )
    
    memory_usage = None
    if memory_total and memory_total > 0:
        memory_usage = ((memory_total - memory_free) / memory_total) * 100
    
    # Uptime (TR-098 e TR-181)
    uptime = get_value(device, "InternetGatewayDevice.DeviceInfo.UpTime") or \
             get_value(device, "Device.DeviceInfo.UpTime")
    
    # LAN Hosts (TR-098 e TR-181)
    lan_clients = (
        get_value(device, "InternetGatewayDevice.LANDevice.1.Hosts.HostNumberOfEntries", 0) or
        get_value(device, "Device.Hosts.HostNumberOfEntries", 0)  # TR-181
    )
    
    return {
        "bytes_received": float(bytes_rx) if bytes_rx else 0,
        "bytes_sent": float(bytes_tx) if bytes_tx else 0,
        "packets_received": int(packets_rx) if packets_rx else 0,
        "packets_sent": int(packets_tx) if packets_tx else 0,
        "wifi_clients_24ghz": int(wifi_24_clients) if wifi_24_clients else 0,
        "wifi_clients_5ghz": int(wifi_5_clients) if wifi_5_clients else 0,
        "channel_24ghz": int(channel_24) if channel_24 else None,
        "channel_5ghz": int(channel_5) if channel_5 else None,
        "cpu_usage": float(cpu_usage) if cpu_usage else None,
        "memory_usage": float(memory_usage) if memory_usage else None,
        "uptime_seconds": int(uptime) if uptime else None,
        "lan_clients": int(lan_clients) if lan_clients else 0
    }


async def collect_metrics():
    """Coleta métricas de todos os dispositivos."""
    log.info("=== Iniciando coleta de métricas ===")
    
    db: Session = SessionLocal()
    svc = MetricsService(db)
    
    try:
        async with httpx.AsyncClient() as client:
            devices = await fetch_devices(client)
            log.info(f"Encontrados {len(devices)} dispositivos no GenieACS")
            
            for device in devices:
                try:
                    device_id = device.get("_id", "")
                    if not device_id:
                        continue
                    
                    # Extrair e atualizar info do dispositivo
                    device_info = extract_device_info(device)
                    svc.upsert_device(device_id, device_info)
                    
                    # Extrair e registrar métricas
                    metrics = extract_metrics(device)
                    if any(v for v in metrics.values() if v is not None):
                        svc.record_metric(device_id, metrics)
                        log.info(f"✓ Métricas coletadas: {device_id} ({device_info.get('manufacturer')} {device_info.get('product_class')})")
                    else:
                        log.warning(f"⚠ Sem métricas para {device_id}")
                    
                except Exception as e:
                    log.error(f"Erro ao processar device {device.get('_id')}: {e}")
                    continue
            
            log.info(f"=== Coleta concluída: {len(devices)} dispositivos processados ===")
            
    except Exception as e:
        log.error(f"Erro na coleta: {e}")
    finally:
        db.close()


async def check_alerts(db: Session):
    """Verifica condições de alerta e cria eventos."""
    svc = MetricsService(db)
    
    devices = svc.list_devices(is_online=True, limit=500)
    
    for device in devices:
        # Verificar latência alta
        summary = svc.get_metrics_summary(device.device_id, hours=1)
        
        if summary.get("total_samples", 0) > 0:
            avg_latency = summary.get("latency", {}).get("avg_ms", 0)
            
            if avg_latency > 100:
                # Verificar se já existe alerta ativo
                existing = db.query(AlertEvent).filter(
                    AlertEvent.device_id == device.id,
                    AlertEvent.category == "connectivity",
                    AlertEvent.status == "active"
                ).first()
                
                if not existing:
                    svc.create_alert(
                        device.device_id,
                        "warning",
                        "connectivity",
                        "Alta latência detectada",
                        f"Latência média de {avg_latency:.1f}ms na última hora",
                        {"avg_latency": avg_latency, "threshold": 100}
                    )
        
        # Verificar packet loss
        packet_loss = summary.get("packet_loss_avg", 0)
        if packet_loss > 5:
            existing = db.query(AlertEvent).filter(
                AlertEvent.device_id == device.id,
                AlertEvent.category == "connectivity",
                AlertEvent.title.like("%Perda de pacotes%"),
                AlertEvent.status == "active"
            ).first()
            
            if not existing:
                svc.create_alert(
                    device.device_id,
                    "error" if packet_loss > 10 else "warning",
                    "connectivity",
                    "Perda de pacotes detectada",
                    f"Perda de {packet_loss:.1f}% de pacotes na última hora",
                    {"packet_loss": packet_loss, "threshold": 5}
                )


async def main():
    """Função principal."""
    while True:
        try:
            await collect_metrics()
            
            # Verificar alertas
            db = SessionLocal()
            try:
                await check_alerts(db)
            finally:
                db.close()
            
            # Aguardar 5 minutos
            log.info("Aguardando 5 minutos até próxima coleta...")
            await asyncio.sleep(300)
            
        except KeyboardInterrupt:
            log.info("Coleta interrompida pelo usuário")
            break
        except Exception as e:
            log.error(f"Erro no loop principal: {e}")
            await asyncio.sleep(60)


if __name__ == "__main__":
    # Importar AlertEvent aqui para evitar import circular
    from app.database.models import AlertEvent
    
    asyncio.run(main())
