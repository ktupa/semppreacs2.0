# app/routers/device_params_router.py
"""
API Router para gerenciamento completo de parâmetros de dispositivos TR-069
"""

from typing import Dict, Any, List, Optional
from fastapi import APIRouter, HTTPException, Query, Body
from pydantic import BaseModel, Field

from app.services.device_params_service import device_params_service


router = APIRouter(prefix="/devices/{device_id}/parameters", tags=["Device Parameters"])


# ============ Schemas ============

class SetParametersRequest(BaseModel):
    """Request para definir parâmetros"""
    parameters: Dict[str, Any] = Field(
        ..., 
        description="Dicionário com {path: value} dos parâmetros a serem definidos",
        example={
            "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID": "MinhaRede",
            "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.Channel": 6
        }
    )
    auto_refresh: bool = Field(
        True, 
        description="Se True, força refresh após setParameterValues"
    )


class ApplyTemplateRequest(BaseModel):
    """Request para aplicar template de configuração"""
    template_name: str = Field(
        ..., 
        description="Nome do template a ser aplicado",
        example="reset_wifi"
    )


class RestoreBackupRequest(BaseModel):
    """Request para restaurar backup"""
    backup_data: Dict[str, Any] = Field(
        ..., 
        description="Dados do backup (retornado por /backup)"
    )


# ============ Endpoints ============

@router.get("/all")
async def get_all_parameters(device_id: str):
    """
    Retorna TODOS os parâmetros disponíveis no dispositivo
    
    - **device_id**: ID do dispositivo no GenieACS
    
    Retorna:
    - total_params: Total de parâmetros encontrados
    - writable_params: Total de parâmetros editáveis
    - parameters: Dict com todos os parâmetros e suas informações
    """
    try:
        return await device_params_service.get_all_parameters(device_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao buscar parâmetros: {str(e)}")


@router.get("/writable")
async def get_writable_parameters(device_id: str):
    """
    Retorna apenas parâmetros editáveis do dispositivo
    
    - **device_id**: ID do dispositivo no GenieACS
    """
    try:
        return await device_params_service.get_writable_parameters(device_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao buscar parâmetros editáveis: {str(e)}")


@router.get("/by-category")
async def get_parameters_by_category(device_id: str):
    """
    Retorna parâmetros organizados por categoria
    
    Categorias comuns:
    - DeviceInfo: Informações do dispositivo
    - WANDevice: Configurações WAN
    - LANDevice: Configurações LAN/WiFi
    - ManagementServer: Configurações TR-069
    - Time: Configurações de tempo/NTP
    """
    try:
        return await device_params_service.get_parameters_by_category(device_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao buscar parâmetros: {str(e)}")


@router.post("/set")
async def set_parameters(
    device_id: str,
    request: SetParametersRequest
):
    """
    Define múltiplos parâmetros no dispositivo via SetParameterValues
    
    - **device_id**: ID do dispositivo no GenieACS
    - **parameters**: Dicionário com {path: value}
    - **auto_refresh**: Se True, força refresh após setParameterValues
    
    Exemplo:
    ```json
    {
        "parameters": {
            "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID": "NovoSSID",
            "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.Channel": 11,
            "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.Enable": true
        },
        "auto_refresh": true
    }
    ```
    """
    try:
        result = await device_params_service.set_parameters(
            device_id, 
            request.parameters,
            request.auto_refresh
        )
        return result
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail=f"Erro ao definir parâmetros: {str(e)}"
        )


@router.post("/template/apply")
async def apply_config_template(
    device_id: str,
    request: ApplyTemplateRequest
):
    """
    Aplica um template de configuração pré-definido
    
    Templates disponíveis:
    - **reset_wifi**: Reseta configurações WiFi para padrão
    - **optimize_wan**: Otimiza configurações WAN
    - **secure_defaults**: Aplica configurações de segurança
    
    Exemplo:
    ```json
    {
        "template_name": "reset_wifi"
    }
    ```
    """
    try:
        result = await device_params_service.apply_config_template(
            device_id,
            request.template_name
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail=f"Erro ao aplicar template: {str(e)}"
        )


@router.get("/template/list")
async def list_config_templates():
    """
    Lista todos os templates de configuração disponíveis
    """
    return {
        "templates": [
            {
                "name": "reset_wifi",
                "description": "Reseta configurações WiFi para padrão seguro",
                "category": "WiFi"
            },
            {
                "name": "optimize_wan",
                "description": "Otimiza configurações WAN para melhor performance",
                "category": "WAN"
            },
            {
                "name": "secure_defaults",
                "description": "Aplica configurações de segurança recomendadas",
                "category": "Security"
            }
        ]
    }


@router.get("/backup")
async def backup_parameters(device_id: str):
    """
    Cria backup de todos os parâmetros editáveis do dispositivo
    
    - **device_id**: ID do dispositivo no GenieACS
    
    Retorna JSON que pode ser usado em /restore para restaurar configurações
    """
    try:
        return await device_params_service.backup_parameters(device_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail=f"Erro ao criar backup: {str(e)}"
        )


@router.post("/restore")
async def restore_parameters(
    device_id: str,
    request: RestoreBackupRequest
):
    """
    Restaura parâmetros de um backup
    
    - **device_id**: ID do dispositivo no GenieACS
    - **backup_data**: Dados do backup (retornado por /backup)
    
    Exemplo:
    ```json
    {
        "backup_data": {
            "device_id": "ABC123",
            "backup_date": "2025-12-09T12:00:00",
            "parameters_count": 150,
            "parameters": {
                "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID": "MinhaRede",
                ...
            }
        }
    }
    ```
    """
    try:
        result = await device_params_service.restore_parameters(
            device_id,
            request.backup_data
        )
        return result
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail=f"Erro ao restaurar backup: {str(e)}"
        )


@router.get("/search")
async def search_parameters(
    device_id: str,
    query: str = Query(..., description="Termo de busca (case-insensitive)"),
    writable_only: bool = Query(False, description="Retornar apenas parâmetros editáveis")
):
    """
    Busca parâmetros por nome/path
    
    - **device_id**: ID do dispositivo
    - **query**: Termo de busca (ex: "SSID", "WiFi", "WAN")
    - **writable_only**: Se True, retorna apenas parâmetros editáveis
    """
    try:
        if writable_only:
            data = await device_params_service.get_writable_parameters(device_id)
        else:
            data = await device_params_service.get_all_parameters(device_id)
        
        # Filtrar parâmetros que contenham o termo de busca
        query_lower = query.lower()
        filtered = {
            path: info 
            for path, info in data['parameters'].items()
            if query_lower in path.lower()
        }
        
        return {
            "device_id": device_id,
            "search_query": query,
            "results_count": len(filtered),
            "parameters": filtered
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail=f"Erro ao buscar parâmetros: {str(e)}"
        )


@router.get("/normalized")
async def get_normalized_data(device_id: str):
    """
    Retorna dados normalizados do dispositivo para uso no frontend.
    
    Suporta multi-vendor: TP-Link, Huawei, ZTE, ZYXEL, D-Link, Intelbras.
    
    Retorna dados estruturados:
    - **device**: Informações do dispositivo (fabricante, modelo, serial, uptime, etc)
    - **wifi**: Configurações WiFi 2.4GHz e 5GHz normalizadas
    - **wan**: Configurações WAN/PPPoE (incluindo login PPPoE para busca IXC)
    - **lan**: Configurações LAN/DHCP
    - **hosts**: Lista de dispositivos conectados
    - **meta**: Metadados (vendor, versão TR)
    """
    try:
        from app.services.tr069_normalizer import normalizer
        import httpx
        import urllib.parse
        
        # Buscar device completo do GenieACS
        encoded_id = urllib.parse.quote(device_id, safe='')
        
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"http://localhost:7557/devices/?query=%7B%22_id%22%3A%22{encoded_id}%22%7D"
            )
            
            if resp.status_code != 200:
                raise ValueError(f"Dispositivo {device_id} não encontrado")
            
            devices = resp.json()
            if not devices:
                raise ValueError(f"Dispositivo {device_id} não encontrado")
            
            device = devices[0]
        
        # Usar normalizer existente
        model_info = normalizer.get_data_model_info(device)
        wifi_24 = normalizer.get_wifi_params(device, radio=1)
        wifi_5 = normalizer.get_wifi_params(device, radio=2)
        wan = normalizer.get_wan_params(device)
        lan = normalizer.get_lan_params(device)
        
        # Formatar uptime
        def format_uptime(seconds):
            if not seconds:
                return "0m"
            days = seconds // 86400
            hours = (seconds % 86400) // 3600
            minutes = (seconds % 3600) // 60
            parts = []
            if days:
                parts.append(f"{days}d")
            if hours:
                parts.append(f"{hours}h")
            if minutes or not parts:
                parts.append(f"{minutes}m")
            return " ".join(parts)
        
        # Formatar bytes
        def format_bytes(b):
            if not b:
                return "0 B"
            for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
                if b < 1024:
                    return f"{b:.1f} {unit}"
                b /= 1024
            return f"{b:.1f} PB"
        
        # Buscar hosts conectados
        hosts = []
        for key, val in device.items():
            if '.Hosts.Host.' in key and '.MACAddress' in key:
                host_path = key.rsplit('.', 1)[0]
                mac = val.get('_value', '') if isinstance(val, dict) else val
                ip_key = f"{host_path}.IPAddress"
                hostname_key = f"{host_path}.HostName"
                active_key = f"{host_path}.Active"
                interface_key = f"{host_path}.InterfaceType"
                
                ip = device.get(ip_key, {}).get('_value', '') if ip_key in device else ''
                hostname = device.get(hostname_key, {}).get('_value', 'Unknown') if hostname_key in device else 'Unknown'
                active = device.get(active_key, {}).get('_value', True) if active_key in device else True
                interface = device.get(interface_key, {}).get('_value', '') if interface_key in device else ''
                
                if mac:
                    hosts.append({
                        "mac": mac,
                        "ip": ip,
                        "hostname": hostname,
                        "active": active in [True, 'true', 1, '1'],
                        "interface": interface
                    })
        
        device_info = {
            "id": device_id,
            "manufacturer": model_info.get('manufacturer', ''),
            "model": model_info.get('product_class', ''),
            "serial": model_info.get('serial', ''),
            "firmware": normalizer.get_value(device, 'device.firmware', None, ''),
            "hardware_version": normalizer.get_value(device, 'device.hardware', None, ''),
            "uptime": normalizer.get_value(device, 'device.uptime', None, 0),
            "uptime_formatted": format_uptime(normalizer.get_value(device, 'device.uptime', None, 0)),
            "last_inform": device.get('_lastInform', ''),
        }
        
        # Montar resposta normalizada
        return {
            "device": device_info,
            "wifi": {
                "2.4GHz": {
                    **wifi_24,
                    "band": "2.4GHz"
                },
                "5GHz": {
                    **wifi_5,
                    "band": "5GHz"
                }
            },
            "wan": {
                "connection_type": "PPPoE" if wan.get('ppp_username') else "DHCP",
                "status": wan.get('ppp_status', 'Unknown'),
                "username": wan.get('ppp_username', ''),  # Login PPPoE para busca IXC
                "ipv4": wan.get('ip_address', ''),
                "ipv6": wan.get('ipv6_address', ''),
                "gateway": wan.get('gateway', ''),
                "dns": wan.get('dns', ''),
                "uptime": wan.get('uptime', 0),
                "uptime_formatted": format_uptime(wan.get('uptime', 0)),
                "rx_bytes": wan.get('rx_bytes', 0),
                "tx_bytes": wan.get('tx_bytes', 0),
                "rx_formatted": format_bytes(wan.get('rx_bytes', 0)),
                "tx_formatted": format_bytes(wan.get('tx_bytes', 0)),
            },
            "lan": {
                "ip_address": lan.get('ip', '192.168.0.1'),
                "subnet_mask": lan.get('mask', '255.255.255.0'),
                "gateway": lan.get('gateway', ''),
                "dhcp_enabled": lan.get('dhcp_enabled', True),
                "dhcp_start": lan.get('dhcp_start', ''),
                "dhcp_end": lan.get('dhcp_end', ''),
                "dhcp_lease_time": lan.get('dhcp_lease', 86400),
                "dns_servers": lan.get('dns_servers', ''),
            },
            "hosts": hosts,
            "hosts_summary": {
                "total": len(hosts),
                "active": sum(1 for h in hosts if h.get('active')),
                "ethernet": sum(1 for h in hosts if 'Ethernet' in h.get('interface', '')),
                "wifi": sum(1 for h in hosts if '802.11' in h.get('interface', '')),
            },
            "meta": {
                "vendor": model_info.get('manufacturer', 'Unknown'),
                "tr_version": model_info.get('model', 'TR-098'),
                "normalized_at": __import__('datetime').datetime.utcnow().isoformat() + "Z",
            }
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail=f"Erro ao normalizar dados: {str(e)}"
        )
