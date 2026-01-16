# app/services/provisioning_service.py
"""
Serviço de Auto-Provisioning para dispositivos TR-069
Aplica configurações automaticamente baseado em regras e templates
"""

from typing import Dict, List, Any, Optional
from datetime import datetime
import httpx
import json
import logging
from sqlalchemy.orm import Session

from app.settings import settings
from app.database import get_db
from app.database.models import Device, SystemConfig

log = logging.getLogger("provisioning")


class ProvisioningRule:
    """Representa uma regra de provisionamento"""
    
    def __init__(
        self,
        name: str,
        match_criteria: Dict[str, Any],
        parameters: Dict[str, Any],
        priority: int = 0,
        enabled: bool = True
    ):
        self.name = name
        self.match_criteria = match_criteria
        self.parameters = parameters
        self.priority = priority
        self.enabled = enabled
    
    def matches(self, device: Dict[str, Any]) -> bool:
        """Verifica se o dispositivo corresponde aos critérios"""
        for key, value in self.match_criteria.items():
            device_value = device.get(key)
            
            # Match por wildcard
            if value == "*":
                continue
            
            # Match por prefixo
            if isinstance(value, str) and value.endswith("*"):
                if not device_value or not device_value.startswith(value[:-1]):
                    return False
                continue
            
            # Match exato
            if device_value != value:
                return False
        
        return True


class ProvisioningService:
    """Serviço de auto-provisioning de dispositivos"""
    
    def __init__(self):
        self.genie_url = settings.GENIE_NBI
        self.rules: List[ProvisioningRule] = []
        self._load_default_rules()
    
    def _load_default_rules(self):
        """Carrega regras padrão de provisionamento"""
        # Regra para TP-Link
        self.rules.append(ProvisioningRule(
            name="tplink_default",
            match_criteria={"manufacturer": "TP-Link"},
            parameters={
                # WiFi 2.4GHz
                "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.BeaconType": "11i",
                "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.IEEE11iEncryptionModes": "AESEncryption",
                "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.WPAAuthenticationMode": "PSKAuthentication",
                # WiFi 5GHz
                "InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.BeaconType": "11i",
                "InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.IEEE11iEncryptionModes": "AESEncryption",
                "InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.WPAAuthenticationMode": "PSKAuthentication",
                # Desabilitar WPS (segurança)
                "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.WPS.Enable": False,
                # DNS automático
                "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.X_TP_DHCPAuto": True,
            },
            priority=100,
            enabled=True
        ))
        
        # Regra para Huawei
        self.rules.append(ProvisioningRule(
            name="huawei_default",
            match_criteria={"manufacturer": "Huawei*"},
            parameters={
                # Configurações genéricas Huawei
                "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.BeaconType": "11i",
                "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.WPAEncryptionModes": "AESEncryption",
            },
            priority=100,
            enabled=True
        ))
        
        # Regra para ZTE
        self.rules.append(ProvisioningRule(
            name="zte_default",
            match_criteria={"manufacturer": "ZTE"},
            parameters={
                "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.BeaconType": "11i",
                "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.WPAEncryptionModes": "AESEncryption",
            },
            priority=100,
            enabled=True
        ))
    
    def add_rule(self, rule: ProvisioningRule):
        """Adiciona uma regra de provisionamento"""
        self.rules.append(rule)
        # Ordenar por prioridade
        self.rules.sort(key=lambda r: r.priority, reverse=True)
    
    def get_matching_rules(self, device_info: Dict[str, Any]) -> List[ProvisioningRule]:
        """Retorna regras que correspondem ao dispositivo"""
        matching = []
        for rule in self.rules:
            if rule.enabled and rule.matches(device_info):
                matching.append(rule)
        return matching
    
    def merge_parameters(self, rules: List[ProvisioningRule]) -> Dict[str, Any]:
        """Merge parâmetros de múltiplas regras (maior prioridade prevalece)"""
        merged = {}
        # Regras com menor prioridade primeiro (serão sobrescritas)
        for rule in sorted(rules, key=lambda r: r.priority):
            merged.update(rule.parameters)
        return merged
    
    async def provision_device(
        self,
        device_id: str,
        device_info: Dict[str, Any],
        extra_params: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Aplica provisionamento em um dispositivo
        
        Args:
            device_id: ID do dispositivo no GenieACS
            device_info: Informações do dispositivo (manufacturer, model, etc)
            extra_params: Parâmetros extras a serem aplicados
            
        Returns:
            Resultado do provisionamento
        """
        # Encontrar regras aplicáveis
        rules = self.get_matching_rules(device_info)
        
        if not rules and not extra_params:
            return {
                "success": True,
                "device_id": device_id,
                "message": "Nenhuma regra de provisionamento encontrada",
                "parameters_applied": 0
            }
        
        # Merge de todos os parâmetros
        parameters = self.merge_parameters(rules)
        
        # Adicionar parâmetros extras
        if extra_params:
            parameters.update(extra_params)
        
        # Aplicar via GenieACS
        log.info(f"Provisionando dispositivo {device_id} com {len(parameters)} parâmetros")
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            success_count = 0
            failed = []
            
            for path, value in parameters.items():
                try:
                    task = {
                        "name": "setParameterValues",
                        "parameterValues": [[path, value, self._infer_type(value)]]
                    }
                    
                    res = await client.post(
                        f"{self.genie_url}/devices/{device_id}/tasks",
                        params={"timeout": 5000, "connection_request": ""},
                        json=task
                    )
                    
                    if res.status_code in [200, 202]:
                        success_count += 1
                    else:
                        failed.append({"path": path, "error": f"HTTP {res.status_code}"})
                        
                except Exception as e:
                    failed.append({"path": path, "error": str(e)})
            
            # Refresh final
            try:
                await client.post(
                    f"{self.genie_url}/devices/{device_id}/tasks",
                    params={"timeout": 10000, "connection_request": ""},
                    json={"name": "refreshObject", "objectName": ""}
                )
            except:
                pass
            
            return {
                "success": success_count == len(parameters),
                "device_id": device_id,
                "rules_applied": [r.name for r in rules],
                "parameters_total": len(parameters),
                "parameters_applied": success_count,
                "parameters_failed": len(failed),
                "failed_details": failed[:10] if failed else [],
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
    
    async def detect_factory_reset(self, device_id: str) -> bool:
        """
        Detecta se um dispositivo foi resetado para fábrica
        Baseado em mudanças de configuração (ex: SSID padrão, senha padrão)
        """
        async with httpx.AsyncClient() as client:
            res = await client.get(
                f"{self.genie_url}/devices/",
                params={"query": f'{{"_id":"{device_id}"}}'})
            
            if res.status_code != 200 or not res.json():
                return False
            
            device = res.json()[0]
            
            # Indicadores de factory reset:
            indicators = 0
            
            # 1. SSID padrão (geralmente contém o modelo ou "TP-Link", etc)
            ssid = self._get_param_value(device, 
                "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID", "")
            default_ssids = ["TP-LINK", "HUAWEI", "ZTE", "OpenWrt", "default"]
            if any(ds.lower() in ssid.lower() for ds in default_ssids):
                indicators += 1
            
            # 2. Senha WiFi padrão ou vazia
            wifi_pass = self._get_param_value(device,
                "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.PreSharedKey.1.PreSharedKey", "")
            if not wifi_pass or len(wifi_pass) < 4:
                indicators += 1
            
            # 3. PPPoE sem usuário
            pppoe_user = self._get_param_value(device,
                "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Username", "")
            if not pppoe_user:
                indicators += 1
            
            # 4. IP padrão (192.168.0.1 ou 192.168.1.1)
            lan_ip = self._get_param_value(device,
                "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.IPRouters", "")
            if lan_ip in ["192.168.0.1", "192.168.1.1"]:
                indicators += 1
            
            # Considera factory reset se >= 2 indicadores
            return indicators >= 2
    
    def _get_param_value(self, device: Dict, path: str, default: Any = None) -> Any:
        """Extrai valor de um parâmetro do dispositivo"""
        try:
            parts = path.split(".")
            current = device
            for part in parts:
                current = current.get(part, {})
            
            if isinstance(current, dict) and "_value" in current:
                return current["_value"]
            return default
        except:
            return default
    
    async def handle_inform(
        self,
        device_id: str,
        device_info: Dict[str, Any],
        event_codes: List[str]
    ) -> Optional[Dict[str, Any]]:
        """
        Trata um evento de Inform do dispositivo
        
        Event codes relevantes:
        - 0 BOOTSTRAP: Primeiro boot ou após factory reset
        - 1 BOOT: Reinício do dispositivo
        - 6 CONNECTION REQUEST: Solicitação de conexão do ACS
        """
        result = None
        
        # BOOTSTRAP = factory reset ou primeiro boot
        if "0 BOOTSTRAP" in event_codes:
            log.info(f"BOOTSTRAP detectado para {device_id}")
            result = await self.provision_device(device_id, device_info)
        
        # BOOT = reinício - verificar se foi factory reset
        elif "1 BOOT" in event_codes:
            is_reset = await self.detect_factory_reset(device_id)
            if is_reset:
                log.info(f"Factory reset detectado para {device_id}")
                result = await self.provision_device(device_id, device_info)
        
        return result


# Singleton
provisioning_service = ProvisioningService()
