# app/services/device_params_service.py
"""
Serviço para gerenciar parâmetros completos de dispositivos TR-069
Busca todos os parâmetros disponíveis e permite edição via SetParameterValues
"""

from typing import Dict, List, Any, Optional
from datetime import datetime
import httpx
from app.settings import settings


class DeviceParametersService:
    """Serviço para operações avançadas com parâmetros de dispositivos"""
    
    def __init__(self):
        self.genie_url = settings.GENIE_NBI
        
    async def get_all_parameters(self, device_id: str) -> Dict[str, Any]:
        """
        Busca TODOS os parâmetros disponíveis no dispositivo
        
        Returns:
            {
                "device_id": str,
                "total_params": int,
                "writable_params": int,
                "parameters": {
                    "path": {
                        "value": any,
                        "type": str,
                        "writable": bool,
                        "timestamp": str
                    }
                }
            }
        """
        async with httpx.AsyncClient() as client:
            # Buscar dispositivo completo do GenieACS
            res = await client.get(
                f"{self.genie_url}/devices/",
                params={"query": f'{{"_id":"{device_id}"}}'})
            
            if res.status_code != 200 or not res.json():
                raise ValueError(f"Dispositivo {device_id} não encontrado")
            
            device_data = res.json()[0]
            
            # Extrair todos os parâmetros recursivamente
            parameters = self._extract_parameters(device_data)
            
            writable_count = sum(1 for p in parameters.values() if p.get('writable'))
            
            return {
                "device_id": device_id,
                "total_params": len(parameters),
                "writable_params": writable_count,
                "parameters": parameters,
                "fetched_at": datetime.utcnow().isoformat()
            }
    
    def _extract_parameters(
        self, 
        obj: Any, 
        prefix: str = '', 
        depth: int = 0, 
        max_depth: int = 10
    ) -> Dict[str, Dict[str, Any]]:
        """
        Extrai recursivamente todos os parâmetros de um objeto GenieACS
        """
        if depth > max_depth:
            return {}
        
        params = {}
        
        if not isinstance(obj, dict):
            return params
        
        for key, value in obj.items():
            # Ignorar metadados do GenieACS
            if key.startswith('_'):
                continue
            
            # Construir path completo
            current_path = f"{prefix}.{key}" if prefix else key
            
            if isinstance(value, dict):
                # Se tem _value, é um parâmetro terminal
                if '_value' in value:
                    params[current_path] = {
                        'value': value.get('_value'),
                        'type': value.get('_type', 'unknown'),
                        'writable': value.get('_writable', False),
                        'timestamp': value.get('_timestamp', '')
                    }
                else:
                    # Continuar recursão
                    params.update(
                        self._extract_parameters(value, current_path, depth + 1, max_depth)
                    )
        
        return params
    
    async def set_parameters(
        self, 
        device_id: str, 
        parameters: Dict[str, Any],
        auto_refresh: bool = True
    ) -> Dict[str, Any]:
        """
        Define múltiplos parâmetros em um dispositivo via SetParameterValues
        
        Args:
            device_id: ID do dispositivo
            parameters: Dict com {path: value}
            auto_refresh: Se True, força refresh após setParameterValues
            
        Returns:
            {"success": bool, "task_id": str, "parameters_set": int}
        """
        import logging
        logger = logging.getLogger(__name__)
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            # Preparar todos os parâmetros em uma única task
            param_values = []
            for path, value in parameters.items():
                param_values.append([path, value, self._infer_type(value)])
            
            logger.info(f"[set_parameters] Device: {device_id}")
            logger.info(f"[set_parameters] Parameters: {param_values}")
            
            # Task única com todos os parâmetros
            task = {
                "name": "setParameterValues",
                "parameterValues": param_values
            }
            
            # Enviar task com connection_request para forçar o dispositivo a conectar
            url = f"{self.genie_url}/devices/{device_id}/tasks?connection_request"
            logger.info(f"[set_parameters] URL: {url}")
            
            res = await client.post(
                url,
                json=task,
                timeout=30.0
            )
            
            logger.info(f"[set_parameters] Response: {res.status_code}")
            
            results = [{
                "status": res.status_code,
                "task": "setParameterValues",
                "success": res.status_code in [200, 202],
                "response": res.text[:500] if res.text else ""
            }]
            
            # Se auto_refresh, adicionar refreshObject após 2 segundos
            if auto_refresh and res.status_code in [200, 202]:
                import asyncio
                await asyncio.sleep(2)
                
                refresh_task = {
                    "name": "refreshObject",
                    "objectName": ""
                }
                refresh_res = await client.post(
                    f"{self.genie_url}/devices/{device_id}/tasks?connection_request",
                    json=refresh_task,
                    timeout=30.0
                )
                results.append({
                    "status": refresh_res.status_code,
                    "task": "refreshObject", 
                    "success": refresh_res.status_code in [200, 202]
                })
            
            success_count = sum(1 for r in results if r['success'])
            
            return {
                "success": success_count == len(results),
                "tasks_executed": len(results),
                "tasks_successful": success_count,
                "results": results,
                "parameters_sent": param_values,
                "timestamp": datetime.utcnow().isoformat()
            }
    
    def _infer_type(self, value: Any) -> str:
        """Infere o tipo XSD do valor"""
        if isinstance(value, bool):
            return "xsd:boolean"
        elif isinstance(value, int):
            return "xsd:int"
        elif isinstance(value, float):
            return "xsd:double"
        else:
            return "xsd:string"
    
    async def get_writable_parameters(self, device_id: str) -> Dict[str, Any]:
        """Retorna apenas parâmetros editáveis"""
        all_params = await self.get_all_parameters(device_id)
        
        writable = {
            path: info 
            for path, info in all_params['parameters'].items() 
            if info.get('writable')
        }
        
        return {
            "device_id": device_id,
            "writable_params": len(writable),
            "parameters": writable,
            "fetched_at": all_params['fetched_at']
        }
    
    async def get_parameters_by_category(self, device_id: str) -> Dict[str, Dict]:
        """
        Organiza parâmetros por categoria (DeviceInfo, WANDevice, LANDevice, etc)
        """
        all_params = await self.get_all_parameters(device_id)
        
        categories = {}
        for path, info in all_params['parameters'].items():
            # Extrair categoria (primeiro nível do path)
            parts = path.split('.')
            if len(parts) >= 2:
                category = parts[1]  # Ex: "DeviceInfo", "WANDevice"
            else:
                category = "Root"
            
            if category not in categories:
                categories[category] = {}
            
            categories[category][path] = info
        
        return {
            "device_id": device_id,
            "categories": categories,
            "total_categories": len(categories),
            "fetched_at": all_params['fetched_at']
        }
    
    async def apply_config_template(
        self, 
        device_id: str, 
        template_name: str
    ) -> Dict[str, Any]:
        """
        Aplica um template de configuração pré-definido
        Suporta tanto TR-098 quanto TR-181 automaticamente
        
        Templates disponíveis:
        - reset_wifi: Reseta configurações WiFi para padrão
        - optimize_wan: Otimiza configurações WAN
        - secure_defaults: Aplica configurações de segurança
        """
        # Templates TR-098 (InternetGatewayDevice)
        templates_098 = {
            "reset_wifi": {
                "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.Enable": True,
                "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSIDAdvertisementEnabled": True,
                "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.Channel": 0,  # Auto
                "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.BeaconType": "11i",
                "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.IEEE11iEncryptionModes": "AESEncryption",
            },
            "optimize_wan": {
                "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.ConnectionType": "IP_Routed",
                "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.NATEnabled": True,
            },
            "secure_defaults": {
                "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSIDAdvertisementEnabled": False,
                "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.BeaconType": "11i",
            }
        }
        
        # Templates TR-181 (Device) - Para Zyxel, TP-Link novos etc
        templates_181 = {
            "reset_wifi": {
                "Device.WiFi.SSID.1.Enable": True,
                "Device.WiFi.AccessPoint.1.SSIDAdvertisementEnabled": True,
                "Device.WiFi.Radio.1.Channel": 0,  # Auto
                "Device.WiFi.AccessPoint.1.Security.ModeEnabled": "WPA2-Personal",
            },
            "optimize_wan": {
                "Device.NAT.InterfaceSetting.1.Enable": True,
            },
            "secure_defaults": {
                "Device.WiFi.AccessPoint.1.SSIDAdvertisementEnabled": False,
                "Device.WiFi.AccessPoint.1.Security.ModeEnabled": "WPA2-Personal",
            }
        }
        
        if template_name not in templates_098:
            raise ValueError(f"Template '{template_name}' não encontrado")
        
        # Detectar modelo do dispositivo para escolher template correto
        device = await self.get_device_info(device_id)
        is_tr181 = "Device.DeviceInfo.Manufacturer" in str(device.get("data", {}))
        
        # Usar template apropriado
        if is_tr181:
            config = templates_181.get(template_name, {})
        else:
            config = templates_098[template_name]
        
        return await self.set_parameters(device_id, config, auto_refresh=True)
    
    async def backup_parameters(self, device_id: str) -> Dict[str, Any]:
        """
        Cria backup de todos os parâmetros editáveis do dispositivo
        Para uso em restore posterior
        """
        writable = await self.get_writable_parameters(device_id)
        
        # Extrair apenas valores para backup
        backup = {
            path: info['value'] 
            for path, info in writable['parameters'].items()
        }
        
        return {
            "device_id": device_id,
            "backup_date": datetime.utcnow().isoformat(),
            "parameters_count": len(backup),
            "parameters": backup
        }
    
    async def restore_parameters(
        self, 
        device_id: str, 
        backup_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Restaura parâmetros de um backup
        """
        parameters = backup_data.get('parameters', {})
        return await self.set_parameters(device_id, parameters, auto_refresh=True)


# Singleton
device_params_service = DeviceParametersService()
