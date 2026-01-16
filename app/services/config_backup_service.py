# app/services/config_backup_service.py
"""
Serviço de Backup e Auto-Restore de Configurações de Dispositivos.
- Salva automaticamente configurações quando alteradas
- Detecta factory reset via uptime baixo + bootstrap event
- Restaura automaticamente configurações após reset
"""

import asyncio
import hashlib
import json
import logging
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

import httpx
from sqlalchemy.orm import Session
from sqlalchemy import and_, desc

from app.database.models import (
    Device, DeviceConfigBackup, DeviceBootstrapEvent, TaskHistory
)
from app.settings import settings

log = logging.getLogger("semppre-bridge.config-backup")

# Threshold para detectar reset (uptime menor que X segundos indica reboot recente)
RESET_UPTIME_THRESHOLD = 600  # 10 minutos
# Threshold para considerar um dispositivo como "novo" (nunca visto antes)
NEW_DEVICE_THRESHOLD_HOURS = 1


class ConfigBackupService:
    """Serviço para backup e restauração de configurações de dispositivos."""
    
    def __init__(self, db: Session):
        self.db = db
        self.genie_url = settings.GENIE_NBI.rstrip("/")
    
    # ============ Extração de Configurações ============
    
    def _get_value(self, obj: Any, path: str, default: Any = None) -> Any:
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
    
    def _extract_wifi_config(self, device_data: Dict) -> Dict[str, Any]:
        """Extrai configurações WiFi do dispositivo."""
        config = {
            "2.4GHz": {},
            "5GHz": {}
        }
        
        # 2.4GHz (WLANConfiguration.1)
        prefix_24 = "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1"
        config["2.4GHz"] = {
            "ssid": self._get_value(device_data, f"{prefix_24}.SSID"),
            "password": self._get_value(device_data, f"{prefix_24}.PreSharedKey.1.PreSharedKey") or 
                       self._get_value(device_data, f"{prefix_24}.KeyPassphrase"),
            "enabled": self._get_value(device_data, f"{prefix_24}.Enable", True),
            "channel": self._get_value(device_data, f"{prefix_24}.Channel"),
            "auto_channel": self._get_value(device_data, f"{prefix_24}.AutoChannelEnable"),
            "security_mode": self._get_value(device_data, f"{prefix_24}.BeaconType") or 
                            self._get_value(device_data, f"{prefix_24}.X_TP_SecurityMode"),
            "hidden": not self._get_value(device_data, f"{prefix_24}.SSIDAdvertisementEnabled", True),
            "bandwidth": self._get_value(device_data, f"{prefix_24}.X_TP_Bandwidth"),
            "txpower": self._get_value(device_data, f"{prefix_24}.X_TP_TransmitPower"),
        }
        
        # 5GHz (WLANConfiguration.2 ou .5)
        for idx in [2, 5]:
            prefix_5 = f"InternetGatewayDevice.LANDevice.1.WLANConfiguration.{idx}"
            ssid_5 = self._get_value(device_data, f"{prefix_5}.SSID")
            if ssid_5:
                config["5GHz"] = {
                    "ssid": ssid_5,
                    "password": self._get_value(device_data, f"{prefix_5}.PreSharedKey.1.PreSharedKey") or
                               self._get_value(device_data, f"{prefix_5}.KeyPassphrase"),
                    "enabled": self._get_value(device_data, f"{prefix_5}.Enable", True),
                    "channel": self._get_value(device_data, f"{prefix_5}.Channel"),
                    "auto_channel": self._get_value(device_data, f"{prefix_5}.AutoChannelEnable"),
                    "security_mode": self._get_value(device_data, f"{prefix_5}.BeaconType") or
                                    self._get_value(device_data, f"{prefix_5}.X_TP_SecurityMode"),
                    "hidden": not self._get_value(device_data, f"{prefix_5}.SSIDAdvertisementEnabled", True),
                    "bandwidth": self._get_value(device_data, f"{prefix_5}.X_TP_Bandwidth"),
                    "txpower": self._get_value(device_data, f"{prefix_5}.X_TP_TransmitPower"),
                }
                break
        
        # TR-181 fallback
        if not config["2.4GHz"].get("ssid"):
            config["2.4GHz"]["ssid"] = self._get_value(device_data, "Device.WiFi.SSID.1.SSID")
            config["2.4GHz"]["password"] = self._get_value(device_data, "Device.WiFi.AccessPoint.1.Security.KeyPassphrase")
            config["5GHz"]["ssid"] = self._get_value(device_data, "Device.WiFi.SSID.2.SSID")
            config["5GHz"]["password"] = self._get_value(device_data, "Device.WiFi.AccessPoint.2.Security.KeyPassphrase")
        
        return config
    
    def _extract_wan_config(self, device_data: Dict) -> Dict[str, Any]:
        """Extrai configurações WAN/PPPoE do dispositivo."""
        config = {}
        
        # PPPoE (TR-098)
        ppp_prefix = "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1"
        config["pppoe"] = {
            "username": self._get_value(device_data, f"{ppp_prefix}.Username"),
            "password": self._get_value(device_data, f"{ppp_prefix}.Password"),
            "enabled": self._get_value(device_data, f"{ppp_prefix}.Enable", True),
            "nat_enabled": self._get_value(device_data, f"{ppp_prefix}.NATEnabled", True),
            "mtu": self._get_value(device_data, f"{ppp_prefix}.MaxMTUSize"),
        }
        
        # TR-181 fallback
        if not config["pppoe"].get("username"):
            config["pppoe"]["username"] = self._get_value(device_data, "Device.PPP.Interface.1.Username")
            config["pppoe"]["password"] = self._get_value(device_data, "Device.PPP.Interface.1.Password")
        
        # IP estático (se aplicável)
        ip_prefix = "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1"
        config["static_ip"] = {
            "address": self._get_value(device_data, f"{ip_prefix}.ExternalIPAddress"),
            "gateway": self._get_value(device_data, f"{ip_prefix}.DefaultGateway"),
            "dns": self._get_value(device_data, f"{ip_prefix}.DNSServers"),
        }
        
        return config
    
    def _extract_lan_config(self, device_data: Dict) -> Dict[str, Any]:
        """Extrai configurações LAN do dispositivo."""
        config = {}
        
        # LAN IP (TR-098)
        lan_prefix = "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement"
        config["ip"] = {
            "address": self._get_value(device_data, f"{lan_prefix}.IPInterface.1.IPInterfaceIPAddress") or
                      self._get_value(device_data, f"{lan_prefix}.IPAddress"),
            "subnet_mask": self._get_value(device_data, f"{lan_prefix}.IPInterface.1.IPInterfaceSubnetMask") or
                          self._get_value(device_data, f"{lan_prefix}.SubnetMask"),
        }
        
        # DHCP
        config["dhcp"] = {
            "enabled": self._get_value(device_data, f"{lan_prefix}.DHCPServerEnable", True),
            "start": self._get_value(device_data, f"{lan_prefix}.MinAddress"),
            "end": self._get_value(device_data, f"{lan_prefix}.MaxAddress"),
            "lease_time": self._get_value(device_data, f"{lan_prefix}.DHCPLeaseTime"),
            "dns_servers": self._get_value(device_data, f"{lan_prefix}.DNSServers"),
        }
        
        return config
    
    def _build_tr069_params(self, wifi_config: Dict, wan_config: Dict, lan_config: Dict) -> List[Dict]:
        """Constrói lista de parâmetros TR-069 para restauração."""
        params = []
        
        # WiFi 2.4GHz
        if wifi_config.get("2.4GHz", {}).get("ssid"):
            wifi_24 = wifi_config["2.4GHz"]
            prefix = "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1"
            
            if wifi_24.get("ssid"):
                params.append({"path": f"{prefix}.SSID", "value": wifi_24["ssid"], "type": "xsd:string"})
            if wifi_24.get("password"):
                params.append({"path": f"{prefix}.PreSharedKey.1.PreSharedKey", "value": wifi_24["password"], "type": "xsd:string"})
                params.append({"path": f"{prefix}.KeyPassphrase", "value": wifi_24["password"], "type": "xsd:string"})
            if wifi_24.get("channel"):
                params.append({"path": f"{prefix}.Channel", "value": str(wifi_24["channel"]), "type": "xsd:unsignedInt"})
            if wifi_24.get("enabled") is not None:
                params.append({"path": f"{prefix}.Enable", "value": str(wifi_24["enabled"]).lower(), "type": "xsd:boolean"})
        
        # WiFi 5GHz
        if wifi_config.get("5GHz", {}).get("ssid"):
            wifi_5 = wifi_config["5GHz"]
            prefix = "InternetGatewayDevice.LANDevice.1.WLANConfiguration.2"
            
            if wifi_5.get("ssid"):
                params.append({"path": f"{prefix}.SSID", "value": wifi_5["ssid"], "type": "xsd:string"})
            if wifi_5.get("password"):
                params.append({"path": f"{prefix}.PreSharedKey.1.PreSharedKey", "value": wifi_5["password"], "type": "xsd:string"})
                params.append({"path": f"{prefix}.KeyPassphrase", "value": wifi_5["password"], "type": "xsd:string"})
            if wifi_5.get("channel"):
                params.append({"path": f"{prefix}.Channel", "value": str(wifi_5["channel"]), "type": "xsd:unsignedInt"})
            if wifi_5.get("enabled") is not None:
                params.append({"path": f"{prefix}.Enable", "value": str(wifi_5["enabled"]).lower(), "type": "xsd:boolean"})
        
        # WAN PPPoE
        if wan_config.get("pppoe", {}).get("username"):
            pppoe = wan_config["pppoe"]
            prefix = "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1"
            
            if pppoe.get("username"):
                params.append({"path": f"{prefix}.Username", "value": pppoe["username"], "type": "xsd:string"})
            if pppoe.get("password"):
                params.append({"path": f"{prefix}.Password", "value": pppoe["password"], "type": "xsd:string"})
        
        # LAN
        if lan_config.get("ip", {}).get("address"):
            lan_ip = lan_config["ip"]
            prefix = "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement"
            
            if lan_ip.get("address"):
                params.append({"path": f"{prefix}.IPInterface.1.IPInterfaceIPAddress", "value": lan_ip["address"], "type": "xsd:string"})
            if lan_ip.get("subnet_mask"):
                params.append({"path": f"{prefix}.IPInterface.1.IPInterfaceSubnetMask", "value": lan_ip["subnet_mask"], "type": "xsd:string"})
        
        return params
    
    def _compute_config_hash(self, config: Dict) -> str:
        """Computa hash da configuração para detectar mudanças."""
        config_str = json.dumps(config, sort_keys=True)
        return hashlib.sha256(config_str.encode()).hexdigest()[:16]
    
    # ============ Operações de Backup ============
    
    async def create_backup(self, device_id: str, device_data: Dict) -> Optional[DeviceConfigBackup]:
        """
        Cria ou atualiza backup de configurações para um dispositivo.
        """
        try:
            # Buscar dispositivo no banco local
            device = self.db.query(Device).filter(Device.device_id == device_id).first()
            if not device:
                log.warning(f"Dispositivo não encontrado no banco local: {device_id}")
                return None
            
            # Extrair identificadores
            serial = self._get_value(device_data, "_deviceId._SerialNumber") or device.serial_number
            mac = self._get_value(device_data, "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.MACAddress")
            
            if not serial:
                log.warning(f"Serial não encontrado para {device_id}")
                return None
            
            # Extrair configurações
            wifi_config = self._extract_wifi_config(device_data)
            wan_config = self._extract_wan_config(device_data)
            lan_config = self._extract_lan_config(device_data)
            
            # Verificar se tem configurações válidas para salvar
            has_wifi = bool(wifi_config.get("2.4GHz", {}).get("ssid"))
            has_wan = bool(wan_config.get("pppoe", {}).get("username"))
            
            if not has_wifi and not has_wan:
                log.debug(f"Sem configurações significativas para backup: {device_id}")
                return None
            
            # Construir parâmetros TR-069 para restore
            tr069_params = self._build_tr069_params(wifi_config, wan_config, lan_config)
            
            # Verificar se já existe backup ativo
            existing = self.db.query(DeviceConfigBackup).filter(
                and_(
                    DeviceConfigBackup.device_id == device.id,
                    DeviceConfigBackup.is_active == True
                )
            ).first()
            
            # Computar hash para verificar se mudou
            config_hash = self._compute_config_hash({
                "wifi": wifi_config,
                "wan": wan_config,
                "lan": lan_config
            })
            
            if existing:
                existing_hash = self._compute_config_hash({
                    "wifi": existing.wifi_config or {},
                    "wan": existing.wan_config or {},
                    "lan": existing.lan_config or {}
                })
                
                if existing_hash == config_hash:
                    log.debug(f"Configuração não mudou para {device_id}")
                    return existing
                
                # Desativar backup antigo
                existing.is_active = False
            
            # Criar novo backup
            backup = DeviceConfigBackup(
                device_id=device.id,
                serial_number=serial,
                mac_address=mac,
                wifi_config=wifi_config,
                wan_config=wan_config,
                lan_config=lan_config,
                tr069_params=tr069_params,
                is_active=True,
                is_auto_restore_enabled=True
            )
            
            self.db.add(backup)
            self.db.commit()
            self.db.refresh(backup)
            
            log.info(f"✅ Backup criado para {device_id} (serial: {serial})")
            return backup
            
        except Exception as e:
            log.error(f"Erro ao criar backup para {device_id}: {e}")
            self.db.rollback()
            return None
    
    def get_active_backup(self, serial_number: str) -> Optional[DeviceConfigBackup]:
        """Busca backup ativo pelo serial number."""
        return self.db.query(DeviceConfigBackup).filter(
            and_(
                DeviceConfigBackup.serial_number == serial_number,
                DeviceConfigBackup.is_active == True,
                DeviceConfigBackup.is_auto_restore_enabled == True
            )
        ).first()
    
    def get_backup_by_device(self, device_id: str) -> Optional[DeviceConfigBackup]:
        """Busca backup ativo pelo device_id do GenieACS."""
        device = self.db.query(Device).filter(Device.device_id == device_id).first()
        if not device:
            return None
        
        return self.db.query(DeviceConfigBackup).filter(
            and_(
                DeviceConfigBackup.device_id == device.id,
                DeviceConfigBackup.is_active == True
            )
        ).first()
    
    # ============ Detecção de Reset/Bootstrap ============
    
    def detect_factory_reset(self, device_data: Dict, previous_uptime: Optional[int] = None) -> Tuple[bool, str]:
        """
        Detecta se um dispositivo passou por factory reset.
        Retorna (is_reset, reason)
        """
        device_id = device_data.get("_id", "")
        serial = self._get_value(device_data, "_deviceId._SerialNumber")
        
        # Verificar uptime atual
        uptime = self._get_value(device_data, "InternetGatewayDevice.DeviceInfo.UpTime") or \
                 self._get_value(device_data, "Device.DeviceInfo.UpTime")
        
        if uptime is not None:
            uptime = int(uptime)
            
            # Uptime muito baixo indica reboot recente
            if uptime < RESET_UPTIME_THRESHOLD:
                # Verificar se é um dispositivo conhecido
                device = self.db.query(Device).filter(Device.device_id == device_id).first()
                
                if device and device.last_inform:
                    # Se o dispositivo já existia e agora tem uptime baixo
                    time_since_last = (datetime.utcnow() - device.last_inform).total_seconds()
                    
                    # Se demorou mais que o uptime atual para reconectar, provavelmente foi reset
                    if time_since_last > uptime + 60:
                        # Verificar se SSID está default (indica factory reset)
                        ssid = self._get_value(device_data, "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID")
                        if ssid and self._is_default_ssid(ssid, serial):
                            return True, "factory_reset_detected"
                        
                        # Verificar se perdeu configuração PPPoE
                        pppoe_user = self._get_value(device_data, 
                            "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Username")
                        if not pppoe_user:
                            return True, "pppoe_config_lost"
                        
                        return True, "uptime_reset_detected"
        
        return False, "no_reset"
    
    def _is_default_ssid(self, ssid: str, serial: Optional[str]) -> bool:
        """Verifica se o SSID é um valor padrão de fábrica."""
        if not ssid:
            return False
        
        ssid_lower = ssid.lower()
        
        # Padrões conhecidos de SSID default
        default_patterns = [
            "tp-link", "tplink", "archer", "deco",
            "intelbras", "twibi", "wi-force", "action",
            "zte", "zxhn", "f670", "f680",
            "huawei", "hg8", "eg8", "ont",
            "fiberhome", "an55", "hg6",
            "multilaser", "re",
            "default", "setup", "wireless"
        ]
        
        for pattern in default_patterns:
            if pattern in ssid_lower:
                return True
        
        # Verificar se o SSID contém o serial (comum em defaults)
        if serial and serial.lower() in ssid_lower:
            return True
        
        # SSID muito curto ou genérico
        if len(ssid) < 4 or ssid.isdigit():
            return True
        
        return False
    
    # ============ Auto-Restore ============
    
    async def auto_restore_config(self, device_id: str, serial_number: str) -> bool:
        """
        Restaura automaticamente configurações de um dispositivo após reset.
        """
        try:
            # Buscar backup ativo
            backup = self.get_active_backup(serial_number)
            if not backup:
                log.info(f"Nenhum backup encontrado para restaurar: {serial_number}")
                return False
            
            if not backup.is_auto_restore_enabled:
                log.info(f"Auto-restore desabilitado para: {serial_number}")
                return False
            
            # Registrar evento de bootstrap
            event = DeviceBootstrapEvent(
                device_id=backup.device_id,
                serial_number=serial_number,
                genie_device_id=device_id,
                event_type="auto_restore_triggered",
                action_taken="auto_restore",
                restore_status="pending"
            )
            self.db.add(event)
            self.db.commit()
            
            # Executar restauração via GenieACS
            success = await self._send_restore_task(device_id, backup.tr069_params)
            
            if success:
                backup.restore_count += 1
                backup.last_restored_at = datetime.utcnow()
                event.restore_status = "success"
                log.info(f"✅ Configurações restauradas com sucesso: {device_id}")
            else:
                event.restore_status = "failed"
                log.error(f"❌ Falha ao restaurar configurações: {device_id}")
            
            self.db.commit()
            return success
            
        except Exception as e:
            log.error(f"Erro no auto-restore para {device_id}: {e}")
            return False
    
    async def _send_restore_task(self, device_id: str, params: List[Dict]) -> bool:
        """Envia task de setParameterValues para restaurar configurações."""
        if not params:
            return False
        
        try:
            # Converter para formato do GenieACS
            parameter_values = []
            for p in params:
                parameter_values.append([
                    p["path"],
                    p["value"],
                    p.get("type", "xsd:string")
                ])
            
            task_payload = {
                "name": "setParameterValues",
                "parameterValues": parameter_values
            }
            
            url = f"{self.genie_url}/devices/{device_id}/tasks?connection_request"
            
            async with httpx.AsyncClient(timeout=60, verify=False) as client:
                resp = await client.post(url, json=task_payload)
                
                if resp.status_code in (200, 202):
                    log.info(f"Task de restore enviada com sucesso: {device_id}")
                    
                    # Registrar no histórico de tasks
                    device = self.db.query(Device).filter(Device.device_id == device_id).first()
                    if device:
                        task_history = TaskHistory(
                            device_id=device.id,
                            task_type="setParameterValues",
                            parameters={"restore": True, "params_count": len(params)},
                            status="pending",
                            triggered_by="auto_restore"
                        )
                        self.db.add(task_history)
                        self.db.commit()
                    
                    return True
                else:
                    log.error(f"Erro ao enviar task de restore: {resp.status_code} - {resp.text}")
                    return False
                    
        except Exception as e:
            log.error(f"Exceção ao enviar task de restore: {e}")
            return False
    
    # ============ Processamento de Novos Dispositivos ============
    
    async def process_new_device(self, device_id: str, device_data: Dict) -> Dict[str, Any]:
        """
        Processa um novo dispositivo ou dispositivo reconectado.
        - Se é novo: salva configurações atuais
        - Se é reconexão após reset: tenta restaurar
        """
        result = {
            "device_id": device_id,
            "is_new": False,
            "reset_detected": False,
            "backup_created": False,
            "restore_attempted": False,
            "restore_success": False
        }
        
        serial = self._get_value(device_data, "_deviceId._SerialNumber")
        if not serial:
            return result
        
        # Verificar se dispositivo existe no banco
        device = self.db.query(Device).filter(Device.device_id == device_id).first()
        
        if not device:
            # Dispositivo novo - verificar se temos backup pelo serial
            existing_backup = self.get_active_backup(serial)
            
            if existing_backup:
                # Temos backup! Pode ser reconexão após troca de device_id
                log.info(f"Dispositivo reconhecido pelo serial: {serial}")
                result["reset_detected"] = True
                result["restore_attempted"] = True
                result["restore_success"] = await self.auto_restore_config(device_id, serial)
            else:
                # Dispositivo completamente novo
                result["is_new"] = True
                log.info(f"Novo dispositivo detectado: {serial}")
        else:
            # Dispositivo conhecido - verificar se houve reset
            is_reset, reason = self.detect_factory_reset(device_data)
            
            if is_reset:
                log.warning(f"Reset detectado para {device_id}: {reason}")
                result["reset_detected"] = True
                result["restore_attempted"] = True
                result["restore_success"] = await self.auto_restore_config(device_id, serial)
        
        # Criar/atualizar backup das configurações atuais (se não houve reset)
        if not result["reset_detected"]:
            backup = await self.create_backup(device_id, device_data)
            result["backup_created"] = backup is not None
        
        return result
    
    # ============ Utilitários ============
    
    def list_backups(self, limit: int = 100, only_active: bool = True) -> List[DeviceConfigBackup]:
        """Lista backups de configurações."""
        query = self.db.query(DeviceConfigBackup)
        
        if only_active:
            query = query.filter(DeviceConfigBackup.is_active == True)
        
        return query.order_by(desc(DeviceConfigBackup.updated_at)).limit(limit).all()
    
    def list_bootstrap_events(self, device_id: Optional[str] = None, limit: int = 50) -> List[DeviceBootstrapEvent]:
        """Lista eventos de bootstrap/reset."""
        query = self.db.query(DeviceBootstrapEvent)
        
        if device_id:
            device = self.db.query(Device).filter(Device.device_id == device_id).first()
            if device:
                query = query.filter(DeviceBootstrapEvent.device_id == device.id)
        
        return query.order_by(desc(DeviceBootstrapEvent.detected_at)).limit(limit).all()
    
    def toggle_auto_restore(self, serial_number: str, enabled: bool) -> bool:
        """Habilita/desabilita auto-restore para um dispositivo."""
        backup = self.get_active_backup(serial_number)
        if not backup:
            return False
        
        backup.is_auto_restore_enabled = enabled
        self.db.commit()
        return True
