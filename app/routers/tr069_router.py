# app/routers/tr069_router.py
# Router para funcionalidades TR-069 com normalização TR-098/TR-181

from fastapi import APIRouter, HTTPException, Query, Body
from typing import Optional, List, Dict, Any
from pydantic import BaseModel
from app.services.tr069_normalizer import TR069Normalizer
from app.settings import settings
import httpx
import asyncio
import logging

router = APIRouter(prefix="/api/tr069", tags=["TR-069"])

normalizer = TR069Normalizer()
log = logging.getLogger("semppre-bridge.tr069")


# =============================================================================
# MODELOS PYDANTIC
# =============================================================================

class DeviceInfo(BaseModel):
    device_id: Optional[str] = None
    manufacturer: Optional[str] = None
    product_class: Optional[str] = None
    serial_number: Optional[str] = None
    data: Optional[Dict[str, Any]] = None


class SetParameterRequest(BaseModel):
    device_id: str
    parameters: List[Dict[str, Any]]
    """
    Cada parâmetro: 
    {
        "path": "wifi.ssid",           # Caminho lógico
        "value": "MinhaRede5G",        # Valor
        "type": "xsd:string",          # Tipo XSD (opcional)
        "vars": {"radio": 1}           # Variáveis (opcional)
    }
    """


class PathRequest(BaseModel):
    logical_path: str
    vars: Optional[Dict[str, Any]] = None


class MultiPathRequest(BaseModel):
    paths: List[str]
    vars: Optional[Dict[str, Any]] = None


class DetectModelRequest(BaseModel):
    device: Dict[str, Any]


class NormalizeResponse(BaseModel):
    success: bool
    data_model: Optional[str] = None
    path: Optional[str] = None
    paths: Optional[Dict[str, str]] = None
    parameters: Optional[List[List[str]]] = None
    error: Optional[str] = None


class ParameterInfo(BaseModel):
    logical_path: str
    tr098_path: str
    tr181_path: str
    category: str


# =============================================================================
# ENDPOINTS DE DETECÇÃO
# =============================================================================

@router.post("/detect-model", response_model=NormalizeResponse, summary="Detectar Data Model")
async def detect_data_model(request: DetectModelRequest):
    """
    Detecta o Data Model do dispositivo (TR-098 ou TR-181).
    
    Baseado na estrutura do objeto e fabricante.
    """
    try:
        model = normalizer.detect_data_model(request.device)
        return NormalizeResponse(
            success=True,
            data_model=model
        )
    except Exception as e:
        return NormalizeResponse(
            success=False,
            error=str(e)
        )


@router.get("/model-info", summary="Informações do modelo de dados")
async def get_model_info(
    manufacturer: str = Query(..., description="Nome do fabricante"),
    product_class: Optional[str] = Query(None, description="Classe do produto")
):
    """
    Retorna informações sobre o data model baseado no fabricante.
    """
    device = {
        "_deviceId": {
            "_Manufacturer": manufacturer,
            "_ProductClass": product_class or ""
        }
    }
    
    model = normalizer.detect_data_model(device)
    return {
        "manufacturer": manufacturer,
        "product_class": product_class,
        "data_model": model,
        "root_path": "Device." if model == "TR-181" else "InternetGatewayDevice."
    }


# =============================================================================
# ENDPOINTS DE NORMALIZAÇÃO DE PATHS
# =============================================================================

@router.post("/get-path", response_model=NormalizeResponse, summary="Obter path normalizado")
async def get_normalized_path(request: PathRequest, device: DeviceInfo = Body(...)):
    """
    Retorna o caminho TR-069 normalizado para o dispositivo.
    
    Detecta automaticamente se é TR-098 ou TR-181.
    """
    try:
        device_dict = device.data or {
            "_deviceId": {
                "_Manufacturer": device.manufacturer or "",
                "_ProductClass": device.product_class or ""
            }
        }
        
        path = normalizer.get_path(device_dict, request.logical_path, request.vars)
        return NormalizeResponse(
            success=True,
            path=path,
            data_model=normalizer.detect_data_model(device_dict)
        )
    except Exception as e:
        return NormalizeResponse(
            success=False,
            error=str(e)
        )


@router.post("/get-paths", response_model=NormalizeResponse, summary="Obter ambos paths")
async def get_both_paths(request: PathRequest):
    """
    Retorna os caminhos para ambos os modelos (TR-098 e TR-181).
    
    Útil para fallback ou quando não se sabe o modelo.
    """
    try:
        paths = normalizer.get_paths(request.logical_path, request.vars)
        return NormalizeResponse(
            success=True,
            paths={
                "tr098": paths[0],
                "tr181": paths[1]
            }
        )
    except Exception as e:
        return NormalizeResponse(
            success=False,
            error=str(e)
        )


@router.post("/build-params", response_model=NormalizeResponse, summary="Construir parâmetros")
async def build_set_parameters(request: SetParameterRequest, device: DeviceInfo = Body(...)):
    """
    Constrói array de parâmetros para setParameterValues com normalização.
    
    Converte caminhos lógicos para caminhos reais baseado no dispositivo.
    """
    try:
        device_dict = device.data or {
            "_deviceId": {
                "_Manufacturer": device.manufacturer or "",
                "_ProductClass": device.product_class or ""
            }
        }
        
        params = normalizer.build_set_params(device_dict, request.parameters)
        return NormalizeResponse(
            success=True,
            parameters=params,
            data_model=normalizer.detect_data_model(device_dict)
        )
    except Exception as e:
        return NormalizeResponse(
            success=False,
            error=str(e)
        )


# =============================================================================
# ENDPOINTS DE CONSULTA
# =============================================================================

@router.get("/available-paths", summary="Listar todos os paths disponíveis")
async def list_available_paths(
    category: Optional[str] = Query(None, description="Filtrar por categoria (device, wan, lan, wifi, diag, nat, etc.)")
):
    """
    Lista todos os caminhos lógicos disponíveis no normalizador.
    """
    paths = normalizer.list_paths(category)
    
    result = []
    for logical_path in paths:
        mapping = normalizer.PARAM_MAP.get(logical_path, {})
        cat = logical_path.split('.')[0] if '.' in logical_path else 'other'
        result.append(ParameterInfo(
            logical_path=logical_path,
            tr098_path=mapping.get("TR-098", ""),
            tr181_path=mapping.get("TR-181", ""),
            category=cat
        ))
    
    return {
        "count": len(result),
        "paths": result
    }


@router.get("/categories", summary="Listar categorias")
async def list_categories():
    """
    Lista todas as categorias de parâmetros disponíveis.
    """
    categories = set()
    for path in normalizer.PARAM_MAP.keys():
        if '.' in path:
            categories.add(path.split('.')[0])
    
    return {
        "categories": sorted(list(categories)),
        "descriptions": {
            "device": "Informações do dispositivo",
            "wan": "Configurações WAN/PPPoE",
            "lan": "Configurações LAN/DHCP",
            "wifi": "Configurações Wi-Fi",
            "diag": "Diagnósticos (ping, traceroute)",
            "nat": "NAT/Port Mapping",
            "eth": "Interfaces Ethernet",
            "firmware": "Firmware/Atualização",
            "acs": "Servidor de Gerenciamento",
            "hosts": "Tabela de hosts"
        }
    }


@router.get("/manufacturers", summary="Fabricantes suportados")
async def list_manufacturers():
    """
    Lista os fabricantes e seus data models padrão.
    """
    return {
        "TR-098": [
            {"name": "TP-Link", "aliases": ["tp-link", "tplink"]},
            {"name": "Intelbras", "aliases": ["intelbras"]},
            {"name": "Multilaser", "aliases": ["multilaser"]},
            {"name": "D-Link", "aliases": ["dlink", "d-link"]},
            {"name": "Tenda", "aliases": ["tenda"]},
            {"name": "Mercusys", "aliases": ["mercusys"]},
            {"name": "ZyXEL", "aliases": ["zyxel"]},
            {"name": "Netgear", "aliases": ["netgear"]},
            {"name": "Linksys", "aliases": ["linksys"]},
            {"name": "ASUS", "aliases": ["asus"]},
        ],
        "TR-181": [
            {"name": "Huawei", "aliases": ["huawei", "hua wei"]},
            {"name": "Fiberhome", "aliases": ["fiberhome", "fiber home"]},
            {"name": "ZTE (moderno)", "aliases": ["zte"]},
            {"name": "Nokia", "aliases": ["nokia"]},
            {"name": "Alcatel-Lucent", "aliases": ["alcatel", "alcatel-lucent"]},
            {"name": "Calix", "aliases": ["calix"]},
            {"name": "Sagemcom", "aliases": ["sagemcom"]},
            {"name": "Technicolor", "aliases": ["technicolor"]},
            {"name": "ADTRAN", "aliases": ["adtran"]},
        ]
    }


# =============================================================================
# ENDPOINTS HELPER PARA WIFI/LAN/WAN
# =============================================================================

@router.post("/wifi-params", summary="Parâmetros Wi-Fi normalizados")
async def get_wifi_params(device: DeviceInfo, radio: int = Query(1, ge=1, le=2)):
    """
    Retorna os caminhos para configuração Wi-Fi de um rádio específico.
    """
    device_dict = device.data or {
        "_deviceId": {
            "_Manufacturer": device.manufacturer or "",
            "_ProductClass": device.product_class or ""
        }
    }
    
    model = normalizer.detect_data_model(device_dict)
    vars = {"radio": radio}
    
    return {
        "data_model": model,
        "radio": radio,
        "paths": {
            "ssid": normalizer.get_path(device_dict, "wifi.ssid", vars),
            "password": normalizer.get_path(device_dict, "wifi.security.password", vars),
            "password_alt": normalizer.get_path(device_dict, "wifi.security.password.alt", vars),
            "channel": normalizer.get_path(device_dict, "wifi.radio.channel", vars),
            "auto_channel": normalizer.get_path(device_dict, "wifi.radio.auto_channel", vars),
            "bandwidth": normalizer.get_path(device_dict, "wifi.radio.bandwidth", vars),
            "tx_power": normalizer.get_path(device_dict, "wifi.radio.txpower", vars),
            "security_mode": normalizer.get_path(device_dict, "wifi.security.mode", vars),
            "hidden": normalizer.get_path(device_dict, "wifi.ssid.hidden", vars),
            "enable": normalizer.get_path(device_dict, "wifi.radio.enable", vars),
        }
    }


@router.post("/lan-params", summary="Parâmetros LAN normalizados")
async def get_lan_params(device: DeviceInfo):
    """
    Retorna os caminhos para configuração LAN/DHCP.
    """
    device_dict = device.data or {
        "_deviceId": {
            "_Manufacturer": device.manufacturer or "",
            "_ProductClass": device.product_class or ""
        }
    }
    
    model = normalizer.detect_data_model(device_dict)
    
    return {
        "data_model": model,
        "paths": {
            "ip": normalizer.get_path(device_dict, "lan.ip"),
            "ip_alt": normalizer.get_path(device_dict, "lan.ip.alt"),
            "mask": normalizer.get_path(device_dict, "lan.mask"),
            "mask_alt": normalizer.get_path(device_dict, "lan.mask.alt"),
            "gateway": normalizer.get_path(device_dict, "lan.gateway"),
            "dhcp_enable": normalizer.get_path(device_dict, "lan.dhcp.enable"),
            "dhcp_start": normalizer.get_path(device_dict, "lan.dhcp.start"),
            "dhcp_end": normalizer.get_path(device_dict, "lan.dhcp.end"),
            "dhcp_lease": normalizer.get_path(device_dict, "lan.dhcp.lease"),
            "dns": normalizer.get_path(device_dict, "lan.dhcp.dns"),
        }
    }


@router.post("/wan-params", summary="Parâmetros WAN normalizados")
async def get_wan_params(device: DeviceInfo):
    """
    Retorna os caminhos para configuração WAN/PPPoE.
    """
    device_dict = device.data or {
        "_deviceId": {
            "_Manufacturer": device.manufacturer or "",
            "_ProductClass": device.product_class or ""
        }
    }
    
    model = normalizer.detect_data_model(device_dict)
    
    return {
        "data_model": model,
        "paths": {
            "ppp_username": normalizer.get_path(device_dict, "wan.ppp.username"),
            "ppp_password": normalizer.get_path(device_dict, "wan.ppp.password"),
            "ppp_ip": normalizer.get_path(device_dict, "wan.ppp.ip"),
            "ppp_status": normalizer.get_path(device_dict, "wan.ppp.status"),
            "ppp_uptime": normalizer.get_path(device_dict, "wan.ppp.uptime"),
            "ip_address": normalizer.get_path(device_dict, "wan.ip.address"),
            "ip_gateway": normalizer.get_path(device_dict, "wan.ip.gateway"),
            "dns": normalizer.get_path(device_dict, "wan.ip.dns"),
            "ipv6_address": normalizer.get_path(device_dict, "wan.ipv6.address"),
            "rx_bytes": normalizer.get_path(device_dict, "wan.stats.rx_bytes"),
            "tx_bytes": normalizer.get_path(device_dict, "wan.stats.tx_bytes"),
        }
    }


@router.post("/diag-params", summary="Parâmetros de diagnóstico normalizados")
async def get_diag_params(device: DeviceInfo):
    """
    Retorna os caminhos para diagnósticos (ping, traceroute, speed test).
    """
    device_dict = device.data or {
        "_deviceId": {
            "_Manufacturer": device.manufacturer or "",
            "_ProductClass": device.product_class or ""
        }
    }
    
    model = normalizer.detect_data_model(device_dict)
    
    return {
        "data_model": model,
        "ping": {
            "host": normalizer.get_path(device_dict, "diag.ping.host"),
            "count": normalizer.get_path(device_dict, "diag.ping.count"),
            "timeout": normalizer.get_path(device_dict, "diag.ping.timeout"),
            "state": normalizer.get_path(device_dict, "diag.ping.state"),
            "success_count": normalizer.get_path(device_dict, "diag.ping.success_count"),
            "failure_count": normalizer.get_path(device_dict, "diag.ping.failure_count"),
            "avg_time": normalizer.get_path(device_dict, "diag.ping.avg_time"),
            "min_time": normalizer.get_path(device_dict, "diag.ping.min_time"),
            "max_time": normalizer.get_path(device_dict, "diag.ping.max_time"),
        },
        "traceroute": {
            "host": normalizer.get_path(device_dict, "diag.traceroute.host"),
            "state": normalizer.get_path(device_dict, "diag.traceroute.state"),
            "hops": normalizer.get_path(device_dict, "diag.traceroute.hops"),
        },
        "download": {
            "url": normalizer.get_path(device_dict, "diag.download.url"),
            "state": normalizer.get_path(device_dict, "diag.download.state"),
            "bytes": normalizer.get_path(device_dict, "diag.download.bytes"),
        },
        "upload": {
            "url": normalizer.get_path(device_dict, "diag.upload.url"),
            "state": normalizer.get_path(device_dict, "diag.upload.state"),
        }
    }


# =============================================================================
# ENDPOINT ROBUSTO PARA SET PARAMETER VALUES
# =============================================================================

class SmartSetParamRequest(BaseModel):
    """Request para setParameterValues inteligente."""
    device_id: str
    parameters: List[Dict[str, Any]]
    """
    Parâmetros podem ser:
    - Caminhos lógicos: {"path": "wifi.ssid", "value": "MinhaRede", "vars": {"radio": 1}}
    - Caminhos absolutos TR-069: {"path": "InternetGatewayDevice.LANDevice...", "value": "..."}
    - Tipo é inferido automaticamente se não especificado
    """
    use_connection_request: bool = True
    retry_on_fail: bool = True
    max_retries: int = 2


class SmartSetParamResponse(BaseModel):
    """Resposta do setParameterValues."""
    success: bool
    device_id: str
    data_model: str
    parameters_sent: List[List[str]]
    task_id: Optional[str] = None
    message: str
    errors: Optional[List[str]] = None


# Mapeamento de caminhos específicos por fabricante
MANUFACTURER_PATH_OVERRIDES = {
    "TP-Link": {
        "wifi.security.password": {
            "TR-098": [
                "InternetGatewayDevice.LANDevice.1.WLANConfiguration.{radio}.PreSharedKey.1.PreSharedKey",
                "InternetGatewayDevice.LANDevice.1.WLANConfiguration.{radio}.KeyPassphrase",
                "InternetGatewayDevice.LANDevice.1.WLANConfiguration.{radio}.X_TP_PreSharedKey",
            ]
        },
        "wifi.ssid": {
            "TR-098": [
                "InternetGatewayDevice.LANDevice.1.WLANConfiguration.{radio}.SSID",
            ]
        },
        "wifi.radio.channel": {
            "TR-098": [
                "InternetGatewayDevice.LANDevice.1.WLANConfiguration.{radio}.Channel",
            ]
        },
    },
    "Intelbras": {
        "wifi.security.password": {
            "TR-098": [
                "InternetGatewayDevice.LANDevice.1.WLANConfiguration.{radio}.PreSharedKey.1.PreSharedKey",
                "InternetGatewayDevice.LANDevice.1.WLANConfiguration.{radio}.KeyPassphrase",
            ]
        },
    },
    "ZTE": {
        "wifi.security.password": {
            "TR-098": [
                "InternetGatewayDevice.LANDevice.1.WLANConfiguration.{radio}.PreSharedKey.1.PreSharedKey",
                "InternetGatewayDevice.LANDevice.1.WLANConfiguration.{radio}.WPAKey",
            ]
        },
    },
    "Huawei": {
        "wifi.security.password": {
            "TR-181": [
                "Device.WiFi.AccessPoint.{radio}.Security.KeyPassphrase",
                "Device.WiFi.AccessPoint.{radio}.Security.PreSharedKey",
            ]
        },
    },
    "Fiberhome": {
        "wifi.security.password": {
            "TR-181": [
                "Device.WiFi.AccessPoint.{radio}.Security.KeyPassphrase",
            ]
        },
    },
}


def infer_xsd_type(value: Any) -> str:
    """Infere o tipo XSD baseado no valor."""
    if isinstance(value, bool):
        return "xsd:boolean"
    if isinstance(value, int):
        return "xsd:unsignedInt"
    if isinstance(value, float):
        return "xsd:string"
    
    # Verificar strings que parecem números
    str_value = str(value).lower()
    if str_value in ("true", "false"):
        return "xsd:boolean"
    try:
        int(value)
        return "xsd:unsignedInt"
    except:
        pass
    
    return "xsd:string"


def normalize_value(value: Any, xsd_type: str) -> str:
    """Normaliza o valor para o formato correto."""
    if xsd_type == "xsd:boolean":
        if isinstance(value, bool):
            return str(value).lower()
        return "true" if str(value).lower() in ("true", "1", "yes", "on") else "false"
    
    return str(value)


def is_logical_path(path: str) -> bool:
    """Verifica se é um caminho lógico ou absoluto TR-069."""
    return not (path.startswith("InternetGatewayDevice.") or path.startswith("Device."))


def get_manufacturer_paths(manufacturer: str, logical_path: str, data_model: str, vars: Dict) -> List[str]:
    """Obtém caminhos específicos do fabricante com fallbacks."""
    paths = []
    
    # Verificar overrides do fabricante
    for manu_key in MANUFACTURER_PATH_OVERRIDES:
        if manu_key.lower() in manufacturer.lower():
            overrides = MANUFACTURER_PATH_OVERRIDES[manu_key]
            if logical_path in overrides:
                model_paths = overrides[logical_path].get(data_model, [])
                for p in model_paths:
                    # Substituir variáveis
                    resolved = p
                    for k, v in vars.items():
                        resolved = resolved.replace("{" + k + "}", str(v))
                    paths.append(resolved)
    
    return paths


async def fetch_device_data(device_id: str) -> Optional[Dict]:
    """Busca dados completos do dispositivo no GenieACS."""
    try:
        url = f"{settings.GENIE_NBI.rstrip('/')}/devices/{device_id}"
        async with httpx.AsyncClient(timeout=30, verify=False) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                return resp.json()
    except Exception as e:
        log.error(f"Erro ao buscar dispositivo {device_id}: {e}")
    return None


async def send_set_parameter_values(
    device_id: str,
    parameters: List[List[str]],
    connection_request: bool = True
) -> Dict[str, Any]:
    """Envia setParameterValues para o GenieACS."""
    url = f"{settings.GENIE_NBI.rstrip('/')}/devices/{device_id}/tasks"
    if connection_request:
        url += "?connection_request"
    
    payload = {
        "name": "setParameterValues",
        "parameterValues": parameters
    }
    
    try:
        async with httpx.AsyncClient(timeout=60, verify=False) as client:
            resp = await client.post(url, json=payload)
            
            return {
                "success": resp.status_code in (200, 202),
                "status_code": resp.status_code,
                "response": resp.json() if resp.status_code in (200, 202) else resp.text,
                "task_id": resp.json().get("_id") if resp.status_code in (200, 202) else None
            }
    except Exception as e:
        return {
            "success": False,
            "status_code": None,
            "response": str(e),
            "task_id": None
        }


@router.post("/set-params", response_model=SmartSetParamResponse, summary="SetParameterValues Inteligente")
async def smart_set_parameter_values(request: SmartSetParamRequest):
    """
    SetParameterValues inteligente com normalização automática.
    
    Funcionalidades:
    - Detecta automaticamente o data model (TR-098 ou TR-181)
    - Normaliza caminhos lógicos para caminhos absolutos
    - Usa caminhos específicos do fabricante quando disponível
    - Infere tipos XSD automaticamente
    - Tenta múltiplos caminhos alternativos se necessário
    - Suporta retry com connection_request
    
    Exemplos de parâmetros:
    ```json
    {
        "device_id": "202BC1-BV6015-S21012345",
        "parameters": [
            {"path": "wifi.ssid", "value": "MinhaRede", "vars": {"radio": 1}},
            {"path": "wifi.security.password", "value": "senha123", "vars": {"radio": 1}},
            {"path": "lan.dhcp.enable", "value": true}
        ]
    }
    ```
    
    Ou com caminhos absolutos:
    ```json
    {
        "device_id": "202BC1-BV6015-S21012345",
        "parameters": [
            {"path": "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID", "value": "MinhaRede"}
        ]
    }
    ```
    """
    errors = []
    
    # Buscar dados do dispositivo
    device_data = await fetch_device_data(request.device_id)
    if not device_data:
        raise HTTPException(status_code=404, detail=f"Dispositivo não encontrado: {request.device_id}")
    
    # Detectar modelo de dados
    data_model = normalizer.detect_data_model(device_data)
    manufacturer = device_data.get("_deviceId", {}).get("_Manufacturer", "Unknown")
    
    log.info(f"Configurando dispositivo {request.device_id} | Modelo: {data_model} | Fabricante: {manufacturer}")
    
    # Processar parâmetros
    parameters_to_send = []
    
    for param in request.parameters:
        path = param.get("path", "")
        value = param.get("value")
        xsd_type = param.get("type")
        vars_dict = param.get("vars", {})
        
        if not path or value is None:
            errors.append(f"Parâmetro inválido: {param}")
            continue
        
        # Inferir tipo se não especificado
        if not xsd_type:
            xsd_type = infer_xsd_type(value)
        
        # Normalizar valor
        normalized_value = normalize_value(value, xsd_type)
        
        # Verificar se é caminho lógico ou absoluto
        if is_logical_path(path):
            # Caminho lógico - normalizar
            try:
                # Tentar caminhos específicos do fabricante primeiro
                manu_paths = get_manufacturer_paths(manufacturer, path, data_model, vars_dict)
                
                if manu_paths:
                    # Usar o primeiro caminho do fabricante
                    resolved_path = manu_paths[0]
                    log.debug(f"Usando caminho específico do fabricante: {resolved_path}")
                else:
                    # Usar normalizer padrão
                    resolved_path = normalizer.get_path(device_data, path, vars_dict)
                
                parameters_to_send.append([resolved_path, normalized_value, xsd_type])
                
            except Exception as e:
                errors.append(f"Erro ao normalizar {path}: {str(e)}")
        else:
            # Caminho absoluto - usar diretamente
            parameters_to_send.append([path, normalized_value, xsd_type])
    
    if not parameters_to_send:
        raise HTTPException(status_code=400, detail="Nenhum parâmetro válido para enviar")
    
    log.info(f"Enviando {len(parameters_to_send)} parâmetros: {parameters_to_send}")
    
    # Enviar para o GenieACS
    result = await send_set_parameter_values(
        request.device_id,
        parameters_to_send,
        request.use_connection_request
    )
    
    # Retry se falhou
    if not result["success"] and request.retry_on_fail:
        for retry in range(request.max_retries):
            log.warning(f"Retry {retry + 1}/{request.max_retries} para {request.device_id}")
            await asyncio.sleep(2)
            result = await send_set_parameter_values(
                request.device_id,
                parameters_to_send,
                True  # Sempre usar connection_request no retry
            )
            if result["success"]:
                break
    
    if result["success"]:
        return SmartSetParamResponse(
            success=True,
            device_id=request.device_id,
            data_model=data_model,
            parameters_sent=parameters_to_send,
            task_id=result.get("task_id"),
            message=f"Parâmetros aplicados com sucesso ({len(parameters_to_send)} params)",
            errors=errors if errors else None
        )
    else:
        return SmartSetParamResponse(
            success=False,
            device_id=request.device_id,
            data_model=data_model,
            parameters_sent=parameters_to_send,
            task_id=None,
            message=f"Falha ao aplicar parâmetros: {result.get('response')}",
            errors=errors + [f"GenieACS retornou: {result.get('status_code')} - {result.get('response')}"]
        )


@router.post("/set-wifi", summary="Configurar WiFi simplificado")
async def set_wifi_config(
    device_id: str = Body(...),
    ssid: Optional[str] = Body(None),
    password: Optional[str] = Body(None),
    channel: Optional[int] = Body(None),
    enabled: Optional[bool] = Body(None),
    radio: int = Body(1, description="1=2.4GHz, 2=5GHz"),
    hidden: Optional[bool] = Body(None),
):
    """
    Endpoint simplificado para configurar WiFi.
    Normaliza automaticamente para qualquer dispositivo.
    """
    params = []
    vars_dict = {"radio": radio}
    
    if ssid is not None:
        params.append({"path": "wifi.ssid", "value": ssid, "vars": vars_dict})
    
    if password is not None:
        params.append({"path": "wifi.security.password", "value": password, "vars": vars_dict})
    
    if channel is not None:
        params.append({"path": "wifi.radio.channel", "value": channel, "vars": vars_dict})
        # Desabilitar auto-channel quando setando canal específico
        if channel > 0:
            params.append({"path": "wifi.radio.auto_channel", "value": False, "vars": vars_dict})
    
    if enabled is not None:
        params.append({"path": "wifi.radio.enable", "value": enabled, "vars": vars_dict})
    
    if hidden is not None:
        # SSIDAdvertisementEnabled é o inverso de hidden
        params.append({"path": "wifi.ssid.hidden", "value": not hidden, "vars": vars_dict})
    
    if not params:
        raise HTTPException(status_code=400, detail="Nenhum parâmetro fornecido")
    
    request = SmartSetParamRequest(
        device_id=device_id,
        parameters=params,
        use_connection_request=True,
        retry_on_fail=True
    )
    
    return await smart_set_parameter_values(request)


@router.post("/set-pppoe", summary="Configurar PPPoE simplificado")
async def set_pppoe_config(
    device_id: str = Body(...),
    username: str = Body(...),
    password: str = Body(...),
):
    """
    Endpoint simplificado para configurar PPPoE.
    Normaliza automaticamente para qualquer dispositivo.
    """
    params = [
        {"path": "wan.ppp.username", "value": username},
        {"path": "wan.ppp.password", "value": password},
    ]
    
    request = SmartSetParamRequest(
        device_id=device_id,
        parameters=params,
        use_connection_request=True,
        retry_on_fail=True
    )
    
    return await smart_set_parameter_values(request)


@router.post("/set-lan", summary="Configurar LAN simplificado")
async def set_lan_config(
    device_id: str = Body(...),
    ip: Optional[str] = Body(None),
    subnet_mask: Optional[str] = Body(None),
    dhcp_enabled: Optional[bool] = Body(None),
    dhcp_start: Optional[str] = Body(None),
    dhcp_end: Optional[str] = Body(None),
    dhcp_lease: Optional[int] = Body(None),
):
    """
    Endpoint simplificado para configurar LAN.
    Normaliza automaticamente para qualquer dispositivo.
    """
    params = []
    
    if ip is not None:
        params.append({"path": "lan.ip", "value": ip})
    
    if subnet_mask is not None:
        params.append({"path": "lan.mask", "value": subnet_mask})
    
    if dhcp_enabled is not None:
        params.append({"path": "lan.dhcp.enable", "value": dhcp_enabled})
    
    if dhcp_start is not None:
        params.append({"path": "lan.dhcp.start", "value": dhcp_start})
    
    if dhcp_end is not None:
        params.append({"path": "lan.dhcp.end", "value": dhcp_end})
    
    if dhcp_lease is not None:
        params.append({"path": "lan.dhcp.lease", "value": dhcp_lease})
    
    if not params:
        raise HTTPException(status_code=400, detail="Nenhum parâmetro fornecido")
    
    request = SmartSetParamRequest(
        device_id=device_id,
        parameters=params,
        use_connection_request=True,
        retry_on_fail=True
    )
    
    return await smart_set_parameter_values(request)


@router.post("/reboot", summary="Reiniciar dispositivo")
async def reboot_device(device_id: str = Body(..., embed=True)):
    """Envia comando de reboot para o dispositivo."""
    url = f"{settings.GENIE_NBI.rstrip('/')}/devices/{device_id}/tasks?connection_request"
    payload = {"name": "reboot"}
    
    try:
        async with httpx.AsyncClient(timeout=30, verify=False) as client:
            resp = await client.post(url, json=payload)
            
            if resp.status_code in (200, 202):
                return {"success": True, "message": "Comando de reboot enviado"}
            else:
                raise HTTPException(status_code=resp.status_code, detail=resp.text)
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.post("/factory-reset", summary="Factory Reset")
async def factory_reset_device(device_id: str = Body(..., embed=True)):
    """Envia comando de factory reset para o dispositivo."""
    url = f"{settings.GENIE_NBI.rstrip('/')}/devices/{device_id}/tasks?connection_request"
    payload = {"name": "factoryReset"}
    
    try:
        async with httpx.AsyncClient(timeout=30, verify=False) as client:
            resp = await client.post(url, json=payload)
            
            if resp.status_code in (200, 202):
                return {"success": True, "message": "Comando de factory reset enviado"}
            else:
                raise HTTPException(status_code=resp.status_code, detail=resp.text)
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.post("/refresh", summary="Atualizar dados do dispositivo")
async def refresh_device(device_id: str = Body(..., embed=True), object_name: str = Body("", embed=True)):
    """Envia comando de refresh para obter dados atualizados do dispositivo."""
    url = f"{settings.GENIE_NBI.rstrip('/')}/devices/{device_id}/tasks?connection_request"
    payload = {"name": "refreshObject", "objectName": object_name}
    
    try:
        async with httpx.AsyncClient(timeout=30, verify=False) as client:
            resp = await client.post(url, json=payload)
            
            if resp.status_code in (200, 202):
                return {"success": True, "message": "Comando de refresh enviado"}
            else:
                raise HTTPException(status_code=resp.status_code, detail=resp.text)
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=str(e))
