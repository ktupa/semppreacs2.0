# app/routers/mobile_api_router.py
"""
API Router para Aplicativo Mobile - Gerenciamento de WiFi via login PPPoE/Serial

Esta API é protegida por um token de API específico para o aplicativo mobile.
Permite buscar dispositivos pelo login PPPoE (ou serial) e alterar configurações WiFi.
"""

from __future__ import annotations

import os
import re
import logging
import hashlib
import secrets
from typing import Dict, Any, List, Optional
from datetime import datetime
from urllib.parse import quote
from fastapi import APIRouter, HTTPException, Depends, Header, Query
from fastapi.security import APIKeyHeader
from pydantic import BaseModel, Field
import httpx

from app.settings import settings

log = logging.getLogger("semppre-bridge.mobile-api")

router = APIRouter(prefix="/api/mobile", tags=["Mobile API"])

# ============ Configuração de Segurança ============

# Token de API para o aplicativo mobile (configurável via .env ou settings)
MOBILE_API_TOKEN = settings.MOBILE_API_TOKEN if hasattr(settings, 'MOBILE_API_TOKEN') else os.getenv("MOBILE_API_TOKEN", None)

if not MOBILE_API_TOKEN:
    # Em produção, SEMPRE defina MOBILE_API_TOKEN no .env
    MOBILE_API_TOKEN = "semppre-mobile-dev-token-2025"
    log.warning("⚠️ MOBILE_API_TOKEN não definido! Usando token de desenvolvimento.")
    log.warning(f"⚠️ Token de desenvolvimento: {MOBILE_API_TOKEN}")

# API Key Header
api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


async def verify_mobile_token(api_key: str = Depends(api_key_header)) -> bool:
    """
    Verifica se o token de API é válido.
    O token deve ser enviado no header X-API-Key.
    """
    if not api_key:
        raise HTTPException(
            status_code=401,
            detail="Token de API não fornecido. Envie o header X-API-Key.",
            headers={"WWW-Authenticate": "ApiKey"}
        )
    
    # Comparação segura contra timing attacks
    if not secrets.compare_digest(api_key, MOBILE_API_TOKEN):
        log.warning(f"Tentativa de acesso com token inválido: {api_key[:10]}...")
        raise HTTPException(
            status_code=401,
            detail="Token de API inválido.",
            headers={"WWW-Authenticate": "ApiKey"}
        )
    
    return True


# ============ Schemas ============

class WifiInfo(BaseModel):
    """Informações de uma rede WiFi"""
    enabled: bool = False
    ssid: Optional[str] = None
    channel: Optional[int] = None
    hidden: bool = False  # True = rede oculta (não visível)
    visible: bool = True  # True = rede visível
    password: Optional[str] = None  # Não retornamos a senha por segurança


class OpticalSignal(BaseModel):
    """Informações do sinal óptico (GPON/EPON)"""
    rx_power: Optional[float] = None  # Potência de recepção em dBm
    tx_power: Optional[float] = None  # Potência de transmissão em dBm
    status: Optional[str] = None  # Up/Down
    

class DeviceSearchResponse(BaseModel):
    """Resposta da busca de dispositivo"""
    found: bool
    device_id: Optional[str] = None
    login: Optional[str] = None
    serial: Optional[str] = None
    model: Optional[str] = None
    manufacturer: Optional[str] = None
    firmware: Optional[str] = None
    online: bool = False
    last_inform: Optional[str] = None
    ip_address: Optional[str] = None
    # Novos campos
    temperature: Optional[float] = None  # Temperatura em Celsius
    optical_signal: Optional[OpticalSignal] = None  # Sinal óptico
    uptime: Optional[int] = None  # Uptime em segundos
    # WiFi
    wifi_2g: Optional[WifiInfo] = None
    wifi_5g: Optional[WifiInfo] = None


class WifiConfigRequest(BaseModel):
    """Request para configuração WiFi"""
    login: str = Field(..., description="Login PPPoE ou Serial do dispositivo")
    
    # WiFi 2.4GHz
    wifi_2g_enabled: Optional[bool] = Field(None, description="Habilitar WiFi 2.4GHz")
    wifi_2g_ssid: Optional[str] = Field(None, min_length=1, max_length=32, description="SSID 2.4GHz")
    wifi_2g_password: Optional[str] = Field(None, min_length=8, max_length=63, description="Senha 2.4GHz (mín. 8 caracteres)")
    wifi_2g_channel: Optional[int] = Field(None, ge=0, le=14, description="Canal 2.4GHz (0=auto, 1-14)")
    wifi_2g_hidden: Optional[bool] = Field(None, description="Ocultar SSID 2.4GHz")
    
    # WiFi 5GHz
    wifi_5g_enabled: Optional[bool] = Field(None, description="Habilitar WiFi 5GHz")
    wifi_5g_ssid: Optional[str] = Field(None, min_length=1, max_length=32, description="SSID 5GHz")
    wifi_5g_password: Optional[str] = Field(None, min_length=8, max_length=63, description="Senha 5GHz (mín. 8 caracteres)")
    wifi_5g_channel: Optional[int] = Field(None, ge=0, le=165, description="Canal 5GHz (0=auto, 36-165)")
    wifi_5g_hidden: Optional[bool] = Field(None, description="Ocultar SSID 5GHz")


class WifiConfigResponse(BaseModel):
    """Resposta da configuração WiFi"""
    success: bool
    device_id: str
    message: str
    parameters_changed: int
    task_id: Optional[str] = None


class ApiStatusResponse(BaseModel):
    """Status da API"""
    status: str
    version: str
    timestamp: str


# ============ Funções Auxiliares ============

async def find_device_by_login_or_serial(identifier: str) -> Optional[Dict[str, Any]]:
    """
    Busca um dispositivo pelo login PPPoE ou serial.
    
    Estratégia de busca:
    1. Primeiro tenta buscar por username PPPoE (login)
    2. Se não encontrar, busca por SerialNumber
    3. Retorna o primeiro dispositivo encontrado
    """
    genie_url = settings.GENIE_NBI
    
    async with httpx.AsyncClient(timeout=30.0, verify=False) as client:
        # Estratégia 1: Buscar por username PPPoE (vários paths possíveis)
        pppoe_paths = [
            "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Username",
            "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.1.Username",
            "Device.PPP.Interface.1.Username",
            "Device.PPP.Interface.2.Username",  # Zyxel e outros TR-181
            "Device.PPP.Interface.3.Username",
        ]
        
        for path in pppoe_paths:
            query = f'{{"{path}._value":"{identifier}"}}'
            log.info(f"[Mobile API] Buscando por PPPoE path: {path}")
            
            try:
                res = await client.get(f"{genie_url}/devices/", params={"query": query})
                if res.status_code == 200:
                    devices = res.json()
                    if devices and len(devices) > 0:
                        log.info(f"[Mobile API] Dispositivo encontrado por PPPoE: {devices[0].get('_id')}")
                        return devices[0]
            except Exception as e:
                log.warning(f"[Mobile API] Erro buscando por PPPoE: {e}")
        
        # Estratégia 2: Buscar por SerialNumber
        serial_paths = [
            "InternetGatewayDevice.DeviceInfo.SerialNumber",
            "Device.DeviceInfo.SerialNumber",
        ]
        
        for path in serial_paths:
            query = f'{{"{path}._value":"{identifier}"}}'
            log.info(f"[Mobile API] Buscando por Serial path: {path}")
            
            try:
                res = await client.get(f"{genie_url}/devices/", params={"query": query})
                if res.status_code == 200:
                    devices = res.json()
                    if devices and len(devices) > 0:
                        log.info(f"[Mobile API] Dispositivo encontrado por Serial: {devices[0].get('_id')}")
                        return devices[0]
            except Exception as e:
                log.warning(f"[Mobile API] Erro buscando por Serial: {e}")
        
        # Estratégia 3: Buscar pelo _id diretamente (se for um ID válido)
        try:
            query = f'{{"_id":"{identifier}"}}'
            res = await client.get(f"{genie_url}/devices/", params={"query": query})
            if res.status_code == 200:
                devices = res.json()
                if devices and len(devices) > 0:
                    log.info(f"[Mobile API] Dispositivo encontrado por ID: {devices[0].get('_id')}")
                    return devices[0]
        except Exception as e:
            log.warning(f"[Mobile API] Erro buscando por ID: {e}")
        
        log.warning(f"[Mobile API] Dispositivo não encontrado para: {identifier}")
        return None


def extract_device_info(device: Dict[str, Any]) -> DeviceSearchResponse:
    """Extrai informações do dispositivo para resposta da API"""
    
    def get_value(obj: Dict, *paths: str, default: Any = None) -> Any:
        """Busca valor em múltiplos paths possíveis"""
        for path in paths:
            parts = path.split('.')
            current = obj
            for part in parts:
                if isinstance(current, dict):
                    current = current.get(part, {})
                else:
                    current = {}
                    break
            if isinstance(current, dict) and '_value' in current:
                return current['_value']
        return default
    
    # Extrair informações básicas
    device_id = device.get('_id', '')
    
    serial = get_value(device,
        'InternetGatewayDevice.DeviceInfo.SerialNumber',
        'Device.DeviceInfo.SerialNumber'
    )
    
    model = get_value(device,
        'InternetGatewayDevice.DeviceInfo.ModelName',
        'Device.DeviceInfo.ModelName'
    )
    
    manufacturer = get_value(device,
        'InternetGatewayDevice.DeviceInfo.Manufacturer',
        'Device.DeviceInfo.Manufacturer'
    )
    
    firmware = get_value(device,
        'InternetGatewayDevice.DeviceInfo.SoftwareVersion',
        'Device.DeviceInfo.SoftwareVersion'
    )
    
    login = get_value(device,
        'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Username',
        'Device.PPP.Interface.1.Username'
    )
    
    # Status online (baseado no _lastInform)
    last_inform_ts = device.get('_lastInform')
    online = False
    last_inform = None
    
    if last_inform_ts:
        try:
            if isinstance(last_inform_ts, str):
                last_dt = datetime.fromisoformat(last_inform_ts.replace('Z', '+00:00'))
            else:
                last_dt = datetime.utcfromtimestamp(last_inform_ts / 1000)
            
            last_inform = last_dt.isoformat()
            # Considera online se inform < 5 minutos
            diff = (datetime.utcnow() - last_dt.replace(tzinfo=None)).total_seconds()
            online = diff < 300
        except Exception:
            pass
    
    # IP Address
    ip_address = get_value(device,
        'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.ExternalIPAddress',
        'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.ExternalIPAddress',
        'Device.IP.Interface.1.IPv4Address.1.IPAddress'
    )
    
    # Uptime (em segundos)
    uptime = get_value(device,
        'InternetGatewayDevice.DeviceInfo.UpTime',
        'Device.DeviceInfo.UpTime'
    )
    if uptime is not None:
        try:
            uptime = int(uptime)
        except (ValueError, TypeError):
            uptime = None
    
    # Temperatura (em Celsius) - múltiplos paths possíveis
    temperature = None
    temp_value = get_value(device,
        'Device.X_ZYXEL_GPON.ONU.temperature',  # Zyxel GPON
        'Device.DeviceInfo.TemperatureStatus.TemperatureSensor.1.Value',
        'Device.DeviceInfo.X_TP_Temperature',
        'InternetGatewayDevice.DeviceInfo.X_TP_Temperature',
        'Device.Optical.Interface.1.Temperature'
    )
    if temp_value is not None:
        try:
            temperature = float(temp_value)
        except (ValueError, TypeError):
            temperature = None
    
    # Sinal Óptico (GPON/EPON)
    optical_signal = None
    
    # Buscar RX Power - múltiplos paths por fabricante
    rx_power = get_value(device,
        'Device.X_ZYXEL_GPON.ONU.rxPower',  # Zyxel GPON (string "-16.72")
        'Device.Optical.Interface.1.OpticalSignalLevel',  # TR-181 padrão
        'InternetGatewayDevice.WANDevice.1.X_GponInterfaceConfig.RXPower',  # TR-098
        'InternetGatewayDevice.WANDevice.1.WANDSLInterfaceConfig.X_BROADCOM_COM_RXPower'  # Broadcom
    )
    
    # Buscar TX Power
    tx_power = get_value(device,
        'Device.X_ZYXEL_GPON.ONU.txPower',  # Zyxel GPON (string "2.39")
        'Device.Optical.Interface.1.TransmitOpticalLevel',  # TR-181 padrão
        'InternetGatewayDevice.WANDevice.1.X_GponInterfaceConfig.TXPower'  # TR-098
    )
    
    # Status da conexão óptica
    optical_status = get_value(device,
        'Device.Optical.Interface.1.Status',
        'Device.X_ZYXEL_GPON.Xpon.phyStatus',
        'InternetGatewayDevice.WANDevice.1.X_GponInterfaceConfig.Status'
    )
    
    # Converter valores de sinal para float
    rx_dbm = None
    tx_dbm = None
    
    if rx_power is not None:
        try:
            rx_val = float(rx_power)
            # Alguns dispositivos retornam em 0.001 dBm (valores > 1000 ou < -1000)
            if rx_val > 100 or rx_val < -100:
                rx_dbm = rx_val / 1000.0
            else:
                rx_dbm = rx_val
        except (ValueError, TypeError):
            pass
    
    if tx_power is not None:
        try:
            tx_val = float(tx_power)
            if tx_val > 100 or tx_val < -100:
                tx_dbm = tx_val / 1000.0
            else:
                tx_dbm = tx_val
        except (ValueError, TypeError):
            pass
    
    # Montar objeto OpticalSignal se houver dados
    if rx_dbm is not None or tx_dbm is not None or optical_status is not None:
        optical_signal = OpticalSignal(
            rx_power=rx_dbm,
            tx_power=tx_dbm,
            status=str(optical_status) if optical_status else None
        )
    
    # WiFi - Detectar índices corretos para TR-181
    wifi_2g = None
    wifi_5g = None
    
    if 'Device' in device:
        # TR-181 - Detectar índices corretos baseado em OperatingFrequencyBand e LowerLayers
        wifi_data = device.get('Device', {}).get('WiFi', {})
        ssid_entries = wifi_data.get('SSID', {})
        radio_entries = wifi_data.get('Radio', {})
        
        # Identificar qual Radio é 2.4GHz e qual é 5GHz
        radio_2g_idx = None
        radio_5g_idx = None
        
        for idx in ['1', '2', '3', '4']:
            radio = radio_entries.get(idx, {})
            band = str(radio.get('OperatingFrequencyBand', {}).get('_value', ''))
            if '2.4' in band:
                radio_2g_idx = idx
            elif '5' in band:
                radio_5g_idx = idx
        
        # Encontrar qual SSID principal está em cada Radio
        ssid_2g_idx = None
        ssid_5g_idx = None
        
        for idx in ['1', '2', '3', '4', '5', '6', '7', '8']:
            ssid_entry = ssid_entries.get(idx, {})
            lower_layers = str(ssid_entry.get('LowerLayers', {}).get('_value', ''))
            
            if radio_2g_idx and f'Radio.{radio_2g_idx}' in lower_layers:
                if ssid_2g_idx is None:  # Primeiro encontrado é o principal
                    ssid_2g_idx = idx
            elif radio_5g_idx and f'Radio.{radio_5g_idx}' in lower_layers:
                if ssid_5g_idx is None:  # Primeiro encontrado é o principal
                    ssid_5g_idx = idx
        
        log.info(f"[Mobile API] TR-181 extração - 2.4GHz: SSID.{ssid_2g_idx}, 5GHz: SSID.{ssid_5g_idx}")
        
        # Extrair WiFi 2.4GHz
        if ssid_2g_idx:
            ssid_data = ssid_entries.get(ssid_2g_idx, {})
            ssid_name = ssid_data.get('SSID', {}).get('_value')
            ssid_enabled = ssid_data.get('Enable', {}).get('_value', False)
            radio_channel = radio_entries.get(radio_2g_idx, {}).get('Channel', {}).get('_value', 0)
            ap_data = wifi_data.get('AccessPoint', {}).get(ssid_2g_idx, {})
            ssid_adv = ap_data.get('SSIDAdvertisementEnabled', {}).get('_value', True)
            
            wifi_2g = WifiInfo(
                enabled=bool(ssid_enabled),
                ssid=ssid_name,
                channel=radio_channel,
                hidden=not ssid_adv,
                visible=bool(ssid_adv)
            )
        
        # Extrair WiFi 5GHz
        if ssid_5g_idx:
            ssid_data = ssid_entries.get(ssid_5g_idx, {})
            ssid_name = ssid_data.get('SSID', {}).get('_value')
            ssid_enabled = ssid_data.get('Enable', {}).get('_value', False)
            radio_channel = radio_entries.get(radio_5g_idx, {}).get('Channel', {}).get('_value', 0)
            ap_data = wifi_data.get('AccessPoint', {}).get(ssid_5g_idx, {})
            ssid_adv = ap_data.get('SSIDAdvertisementEnabled', {}).get('_value', True)
            
            wifi_5g = WifiInfo(
                enabled=bool(ssid_enabled),
                ssid=ssid_name,
                channel=radio_channel,
                hidden=not ssid_adv,
                visible=bool(ssid_adv)
            )
    
    else:
        # TR-098 (InternetGatewayDevice)
        ssid_2g = get_value(device,
            'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID'
        )
        if ssid_2g:
            enabled_2g = get_value(device,
                'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.Enable'
            )
            channel_2g = get_value(device,
                'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.Channel'
            )
            ssid_adv_2g = get_value(device,
                'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSIDAdvertisementEnabled',
                default=True
            )
            wifi_2g = WifiInfo(
                enabled=bool(enabled_2g),
                ssid=ssid_2g,
                channel=channel_2g,
                hidden=not ssid_adv_2g,
                visible=bool(ssid_adv_2g)
            )
        
        # WiFi 5GHz - TR-098 (pode estar em .2 ou .5)
        ssid_5g = get_value(device,
            'InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.SSID',
            'InternetGatewayDevice.LANDevice.1.WLANConfiguration.2.SSID'
        )
        if ssid_5g:
            enabled_5g = get_value(device,
                'InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.Enable',
                'InternetGatewayDevice.LANDevice.1.WLANConfiguration.2.Enable'
            )
            channel_5g = get_value(device,
                'InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.Channel',
                'InternetGatewayDevice.LANDevice.1.WLANConfiguration.2.Channel'
            )
            ssid_adv_5g = get_value(device,
                'InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.SSIDAdvertisementEnabled',
                'InternetGatewayDevice.LANDevice.1.WLANConfiguration.2.SSIDAdvertisementEnabled',
                default=True
            )
            wifi_5g = WifiInfo(
                enabled=bool(enabled_5g),
                ssid=ssid_5g,
                channel=channel_5g,
                hidden=not ssid_adv_5g,
                visible=bool(ssid_adv_5g)
            )
    
    return DeviceSearchResponse(
        found=True,
        device_id=device_id,
        login=login,
        serial=serial,
        model=model,
        manufacturer=manufacturer,
        firmware=firmware,
        online=online,
        last_inform=last_inform,
        ip_address=ip_address,
        temperature=temperature,
        optical_signal=optical_signal,
        uptime=uptime,
        wifi_2g=wifi_2g,
        wifi_5g=wifi_5g
    )


def detect_device_paths(device: Dict[str, Any]) -> Dict[str, str]:
    """
    Detecta os paths corretos de WiFi para o dispositivo.
    Suporta TR-098 e TR-181.
    """
    paths = {}
    
    def path_exists(obj: Dict, path: str) -> bool:
        """Verifica se um path existe no objeto"""
        parts = path.split('.')
        current = obj
        for part in parts:
            if isinstance(current, dict) and part in current:
                current = current[part]
            else:
                return False
        return True
    
    # Detectar modelo TR-098 vs TR-181
    if 'InternetGatewayDevice' in device:
        # TR-098
        base_lan = 'InternetGatewayDevice.LANDevice.1.WLANConfiguration'
        
        # Verificar se existe WLANConfiguration.1 (2.4GHz)
        wlan_config = device.get('InternetGatewayDevice', {}).get('LANDevice', {}).get('1', {}).get('WLANConfiguration', {})
        
        if '1' in wlan_config:
            paths['wifi_2g_base'] = f'{base_lan}.1'
            log.info(f"[Mobile API] Detectado WiFi 2.4GHz em: {paths['wifi_2g_base']}")
        
        # 5GHz pode estar em .2, .5 ou outro índice
        for idx in ['2', '5', '3', '4']:
            if idx in wlan_config:
                paths['wifi_5g_base'] = f'{base_lan}.{idx}'
                log.info(f"[Mobile API] Detectado WiFi 5GHz em: {paths['wifi_5g_base']}")
                break
        
        # Paths específicos para 2.4GHz
        if 'wifi_2g_base' in paths:
            base = paths['wifi_2g_base']
            paths['wifi_2g_enabled'] = f'{base}.Enable'
            paths['wifi_2g_ssid'] = f'{base}.SSID'
            paths['wifi_2g_password'] = f'{base}.PreSharedKey.1.PreSharedKey'
            paths['wifi_2g_channel'] = f'{base}.Channel'
            paths['wifi_2g_hidden'] = f'{base}.SSIDAdvertisementEnabled'
        
        # Paths específicos para 5GHz
        if 'wifi_5g_base' in paths:
            base = paths['wifi_5g_base']
            paths['wifi_5g_enabled'] = f'{base}.Enable'
            paths['wifi_5g_ssid'] = f'{base}.SSID'
            paths['wifi_5g_password'] = f'{base}.PreSharedKey.1.PreSharedKey'
            paths['wifi_5g_channel'] = f'{base}.Channel'
            paths['wifi_5g_hidden'] = f'{base}.SSIDAdvertisementEnabled'
    
    elif 'Device' in device:
        # TR-181 - Detectar índices corretos baseado em LowerLayers
        wifi_data = device.get('Device', {}).get('WiFi', {})
        ssid_entries = wifi_data.get('SSID', {})
        radio_entries = wifi_data.get('Radio', {})
        
        # Primeiro, identificar qual Radio é 2.4GHz e qual é 5GHz
        radio_2g_idx = None
        radio_5g_idx = None
        
        for idx in ['1', '2', '3', '4']:
            radio = radio_entries.get(idx, {})
            band = radio.get('OperatingFrequencyBand', {}).get('_value', '')
            if '2.4' in str(band):
                radio_2g_idx = idx
            elif '5' in str(band):
                radio_5g_idx = idx
        
        log.info(f"[Mobile API] TR-181 Radios - 2.4GHz: Radio.{radio_2g_idx}, 5GHz: Radio.{radio_5g_idx}")
        
        # Agora encontrar qual SSID principal está em cada Radio
        # O primeiro SSID vinculado a cada Radio é o principal
        ssid_2g_idx = None
        ssid_5g_idx = None
        
        for idx in ['1', '2', '3', '4', '5', '6', '7', '8']:
            ssid_entry = ssid_entries.get(idx, {})
            lower_layers = ssid_entry.get('LowerLayers', {}).get('_value', '')
            
            # Verifica qual Radio este SSID usa
            if radio_2g_idx and f'Radio.{radio_2g_idx}' in lower_layers:
                if ssid_2g_idx is None:  # Primeiro encontrado é o principal
                    ssid_2g_idx = idx
            elif radio_5g_idx and f'Radio.{radio_5g_idx}' in lower_layers:
                if ssid_5g_idx is None:  # Primeiro encontrado é o principal
                    ssid_5g_idx = idx
        
        log.info(f"[Mobile API] TR-181 SSIDs - 2.4GHz: SSID.{ssid_2g_idx}, 5GHz: SSID.{ssid_5g_idx}")
        
        # Montar paths usando os índices corretos
        if ssid_2g_idx:
            paths['wifi_2g_enabled'] = f'Device.WiFi.SSID.{ssid_2g_idx}.Enable'
            paths['wifi_2g_ssid'] = f'Device.WiFi.SSID.{ssid_2g_idx}.SSID'
            paths['wifi_2g_password'] = f'Device.WiFi.AccessPoint.{ssid_2g_idx}.Security.KeyPassphrase'
            paths['wifi_2g_channel'] = f'Device.WiFi.Radio.{radio_2g_idx}.Channel' if radio_2g_idx else None
            paths['wifi_2g_hidden'] = f'Device.WiFi.AccessPoint.{ssid_2g_idx}.SSIDAdvertisementEnabled'
        
        if ssid_5g_idx:
            paths['wifi_5g_enabled'] = f'Device.WiFi.SSID.{ssid_5g_idx}.Enable'
            paths['wifi_5g_ssid'] = f'Device.WiFi.SSID.{ssid_5g_idx}.SSID'
            paths['wifi_5g_password'] = f'Device.WiFi.AccessPoint.{ssid_5g_idx}.Security.KeyPassphrase'
            paths['wifi_5g_channel'] = f'Device.WiFi.Radio.{radio_5g_idx}.Channel' if radio_5g_idx else None
            paths['wifi_5g_hidden'] = f'Device.WiFi.AccessPoint.{ssid_5g_idx}.SSIDAdvertisementEnabled'
    
    log.info(f"[Mobile API] Paths detectados: {list(paths.keys())}")
    return paths


# ============ Endpoints ============

@router.get("/status", response_model=ApiStatusResponse)
async def api_status():
    """
    Verifica o status da API Mobile.
    Este endpoint NÃO requer autenticação.
    """
    return ApiStatusResponse(
        status="online",
        version="1.0.0",
        timestamp=datetime.utcnow().isoformat()
    )


@router.get("/device/search", response_model=DeviceSearchResponse, dependencies=[Depends(verify_mobile_token)])
async def search_device(
    login: str = Query(..., description="Login PPPoE ou Serial do dispositivo")
):
    """
    Busca um dispositivo pelo login PPPoE ou serial.
    
    **Autenticação:** Requer header `X-API-Key` com o token da API.
    
    **Parâmetros:**
    - `login`: Login PPPoE do cliente ou SerialNumber do dispositivo
    
    **Retorna:**
    - Informações do dispositivo incluindo WiFi atual
    """
    device = await find_device_by_login_or_serial(login)
    
    if not device:
        return DeviceSearchResponse(
            found=False,
            login=login,
            serial=None
        )
    
    return extract_device_info(device)


@router.post("/wifi/configure", response_model=WifiConfigResponse, dependencies=[Depends(verify_mobile_token)])
async def configure_wifi(request: WifiConfigRequest):
    """
    Configura WiFi do dispositivo.
    
    **Autenticação:** Requer header `X-API-Key` com o token da API.
    
    **Parâmetros:**
    - `login`: Login PPPoE ou Serial do dispositivo
    - Parâmetros WiFi 2.4GHz e/ou 5GHz (opcionais)
    
    **Observações:**
    - Apenas os parâmetros fornecidos serão alterados
    - Senhas devem ter no mínimo 8 caracteres
    - Canal 0 significa automático
    """
    log.info(f"[Mobile API] Requisição de configuração WiFi para: {request.login}")
    
    # Buscar dispositivo
    device = await find_device_by_login_or_serial(request.login)
    
    if not device:
        raise HTTPException(
            status_code=404,
            detail=f"Dispositivo não encontrado para login/serial: {request.login}"
        )
    
    device_id = device.get('_id')
    log.info(f"[Mobile API] Dispositivo encontrado: {device_id}")
    
    # Detectar paths corretos para o dispositivo
    paths = detect_device_paths(device)
    log.info(f"[Mobile API] Paths detectados: {paths}")
    
    # Montar parâmetros a serem alterados
    parameters = {}
    
    # WiFi 2.4GHz
    if request.wifi_2g_enabled is not None and 'wifi_2g_enabled' in paths:
        parameters[paths['wifi_2g_enabled']] = request.wifi_2g_enabled
    
    if request.wifi_2g_ssid is not None and 'wifi_2g_ssid' in paths:
        parameters[paths['wifi_2g_ssid']] = request.wifi_2g_ssid
    
    if request.wifi_2g_password is not None and 'wifi_2g_password' in paths:
        parameters[paths['wifi_2g_password']] = request.wifi_2g_password
    
    if request.wifi_2g_channel is not None and 'wifi_2g_channel' in paths:
        parameters[paths['wifi_2g_channel']] = request.wifi_2g_channel
    
    if request.wifi_2g_hidden is not None and 'wifi_2g_hidden' in paths:
        # SSIDAdvertisementEnabled é invertido (true = visível, false = oculto)
        parameters[paths['wifi_2g_hidden']] = not request.wifi_2g_hidden
    
    # WiFi 5GHz
    if request.wifi_5g_enabled is not None and 'wifi_5g_enabled' in paths:
        parameters[paths['wifi_5g_enabled']] = request.wifi_5g_enabled
    
    if request.wifi_5g_ssid is not None and 'wifi_5g_ssid' in paths:
        parameters[paths['wifi_5g_ssid']] = request.wifi_5g_ssid
    
    if request.wifi_5g_password is not None and 'wifi_5g_password' in paths:
        parameters[paths['wifi_5g_password']] = request.wifi_5g_password
    
    if request.wifi_5g_channel is not None and 'wifi_5g_channel' in paths:
        parameters[paths['wifi_5g_channel']] = request.wifi_5g_channel
    
    if request.wifi_5g_hidden is not None and 'wifi_5g_hidden' in paths:
        parameters[paths['wifi_5g_hidden']] = not request.wifi_5g_hidden
    
    if not parameters:
        raise HTTPException(
            status_code=400,
            detail="Nenhum parâmetro WiFi fornecido para alteração"
        )
    
    log.info(f"[Mobile API] Parâmetros a alterar: {parameters}")
    
    # Enviar para o GenieACS
    genie_url = settings.GENIE_NBI
    
    async with httpx.AsyncClient(timeout=30.0, verify=False) as client:
        # Preparar task de setParameterValues
        param_values = []
        for path, value in parameters.items():
            # Inferir tipo
            if isinstance(value, bool):
                param_values.append([path, value, "xsd:boolean"])
            elif isinstance(value, int):
                param_values.append([path, value, "xsd:unsignedInt"])
            else:
                param_values.append([path, str(value), "xsd:string"])
        
        task = {
            "name": "setParameterValues",
            "parameterValues": param_values
        }
        
        # Enviar com connection_request para forçar execução imediata
        # O device_id já vem URL-encoded do GenieACS, precisamos fazer encode novamente para a URL
        encoded_device_id = quote(device_id, safe='')
        url = f"{genie_url}/devices/{encoded_device_id}/tasks?connection_request"
        log.info(f"[Mobile API] Enviando task para: {url}")
        
        try:
            res = await client.post(url, json=task)
            
            if res.status_code in [200, 202]:
                task_data = res.json() if res.text else {}
                task_id = task_data.get('_id', 'pending')
                
                log.info(f"[Mobile API] Task criada com sucesso: {task_id}")
                
                return WifiConfigResponse(
                    success=True,
                    device_id=device_id,
                    message="Configuração WiFi enviada com sucesso. As alterações serão aplicadas em breve.",
                    parameters_changed=len(parameters),
                    task_id=task_id
                )
            else:
                log.error(f"[Mobile API] Erro ao criar task: {res.status_code} - {res.text}")
                raise HTTPException(
                    status_code=502,
                    detail=f"Erro ao comunicar com o dispositivo: {res.status_code}"
                )
        
        except httpx.HTTPError as e:
            log.error(f"[Mobile API] Erro HTTP: {e}")
            raise HTTPException(
                status_code=502,
                detail=f"Erro de comunicação com o servidor ACS: {str(e)}"
            )


@router.get("/device/{device_id}/wifi", dependencies=[Depends(verify_mobile_token)])
async def get_device_wifi(device_id: str):
    """
    Obtém configuração WiFi atual de um dispositivo específico.
    
    **Autenticação:** Requer header `X-API-Key` com o token da API.
    """
    genie_url = settings.GENIE_NBI
    
    async with httpx.AsyncClient(timeout=30.0, verify=False) as client:
        query = f'{{"_id":"{device_id}"}}'
        res = await client.get(f"{genie_url}/devices/", params={"query": query})
        
        if res.status_code != 200 or not res.json():
            raise HTTPException(
                status_code=404,
                detail=f"Dispositivo {device_id} não encontrado"
            )
        
        device = res.json()[0]
        return extract_device_info(device)


@router.post("/device/{device_id}/reboot", dependencies=[Depends(verify_mobile_token)])
async def reboot_device(device_id: str):
    """
    Reinicia um dispositivo.
    
    **Autenticação:** Requer header `X-API-Key` com o token da API.
    """
    genie_url = settings.GENIE_NBI
    
    async with httpx.AsyncClient(timeout=30.0, verify=False) as client:
        task = {"name": "reboot"}
        encoded_device_id = quote(device_id, safe='')
        url = f"{genie_url}/devices/{encoded_device_id}/tasks?connection_request"
        
        try:
            res = await client.post(url, json=task)
            
            if res.status_code in [200, 202]:
                return {
                    "success": True,
                    "device_id": device_id,
                    "message": "Comando de reinicialização enviado. O dispositivo será reiniciado em breve."
                }
            else:
                raise HTTPException(
                    status_code=502,
                    detail=f"Erro ao enviar comando de reboot: {res.status_code}"
                )
        except httpx.HTTPError as e:
            raise HTTPException(
                status_code=502,
                detail=f"Erro de comunicação: {str(e)}"
            )


@router.post("/device/{device_id}/refresh", dependencies=[Depends(verify_mobile_token)])
async def refresh_device(device_id: str):
    """
    Força atualização dos parâmetros de um dispositivo.
    
    **Autenticação:** Requer header `X-API-Key` com o token da API.
    """
    genie_url = settings.GENIE_NBI
    
    async with httpx.AsyncClient(timeout=30.0, verify=False) as client:
        task = {"name": "refreshObject", "objectName": ""}
        encoded_device_id = quote(device_id, safe='')
        url = f"{genie_url}/devices/{encoded_device_id}/tasks?connection_request"
        
        try:
            res = await client.post(url, json=task)
            
            if res.status_code in [200, 202]:
                return {
                    "success": True,
                    "device_id": device_id,
                    "message": "Refresh solicitado. Os parâmetros serão atualizados em breve."
                }
            else:
                raise HTTPException(
                    status_code=502,
                    detail=f"Erro ao enviar comando de refresh: {res.status_code}"
                )
        except httpx.HTTPError as e:
            raise HTTPException(
                status_code=502,
                detail=f"Erro de comunicação: {str(e)}"
            )
