# app/services/tr069_normalizer.py
# Serviço de Normalização TR-069 para suporte a TR-098 (TP-Link/Intelbras/ZTE) e TR-181 (Huawei/Fiberhome)

from typing import Any, Dict, List, Optional, Tuple, Literal
import re
import logging

logger = logging.getLogger(__name__)

DataModel = Literal["TR-098", "TR-181"]


# =============================================================================
# MAPEAMENTO COMPLETO DE PARÂMETROS TR-098 ↔ TR-181
# =============================================================================
PARAM_MAP: Dict[str, Dict[str, str]] = {
    # ==================== DEVICE INFO ====================
    "device.manufacturer": {
        "TR-098": "InternetGatewayDevice.DeviceInfo.Manufacturer",
        "TR-181": "Device.DeviceInfo.Manufacturer"
    },
    "device.model": {
        "TR-098": "InternetGatewayDevice.DeviceInfo.ModelName",
        "TR-181": "Device.DeviceInfo.ModelName"
    },
    "device.serial": {
        "TR-098": "InternetGatewayDevice.DeviceInfo.SerialNumber",
        "TR-181": "Device.DeviceInfo.SerialNumber"
    },
    "device.firmware": {
        "TR-098": "InternetGatewayDevice.DeviceInfo.SoftwareVersion",
        "TR-181": "Device.DeviceInfo.SoftwareVersion"
    },
    "device.uptime": {
        "TR-098": "InternetGatewayDevice.DeviceInfo.UpTime",
        "TR-181": "Device.DeviceInfo.UpTime"
    },
    "device.hardware": {
        "TR-098": "InternetGatewayDevice.DeviceInfo.HardwareVersion",
        "TR-181": "Device.DeviceInfo.HardwareVersion"
    },
    "device.reboot": {
        "TR-098": "InternetGatewayDevice.X_TP_Reboot",
        "TR-181": "Device.Reboot"
    },

    # ==================== WAN PPP ====================
    "wan.ppp.username": {
        "TR-098": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Username",
        "TR-181": "Device.PPP.Interface.1.Username"
    },
    "wan.ppp.password": {
        "TR-098": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Password",
        "TR-181": "Device.PPP.Interface.1.Password"
    },
    "wan.ppp.ip": {
        "TR-098": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.ExternalIPAddress",
        "TR-181": "Device.PPP.Interface.1.IPCP.LocalIPAddress"
    },
    "wan.ppp.status": {
        "TR-098": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.ConnectionStatus",
        "TR-181": "Device.PPP.Interface.1.Status"
    },
    "wan.ppp.uptime": {
        "TR-098": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Uptime",
        "TR-181": "Device.PPP.Interface.1.Stats.ConnectionUptime"
    },

    # ==================== WAN IP ====================
    "wan.ip.address": {
        "TR-098": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.ExternalIPAddress",
        "TR-181": "Device.IP.Interface.1.IPv4Address.1.IPAddress"
    },
    "wan.ip.gateway": {
        "TR-098": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.DefaultGateway",
        "TR-181": "Device.Routing.Router.1.IPv4Forwarding.1.GatewayIPAddress"
    },
    "wan.ip.dns": {
        "TR-098": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.DNSServers",
        "TR-181": "Device.DNS.Client.Server.1.DNSServer"
    },

    # ==================== WAN IPv6 ====================
    "wan.ipv6.address": {
        "TR-098": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.X_HW_IPv6Address",
        "TR-181": "Device.IP.Interface.1.IPv6Address.1.IPAddress"
    },
    "wan.ipv6.prefix": {
        "TR-098": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.X_TP_IPv6PrefixList",
        "TR-181": "Device.IP.Interface.1.IPv6Prefix.1.Prefix"
    },
    "wan.ipv6.enable": {
        "TR-098": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.X_TPLINK_IPv6Enable",
        "TR-181": "Device.IP.Interface.1.IPv6Enable"
    },

    # ==================== WAN STATS ====================
    "wan.stats.rx_bytes": {
        "TR-098": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Stats.EthernetBytesReceived",
        "TR-181": "Device.PPP.Interface.1.Stats.BytesReceived"
    },
    "wan.stats.tx_bytes": {
        "TR-098": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Stats.EthernetBytesSent",
        "TR-181": "Device.PPP.Interface.1.Stats.BytesSent"
    },

    # ==================== LAN ====================
    "lan.ip": {
        "TR-098": "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.IPInterface.1.IPInterfaceIPAddress",
        "TR-181": "Device.IP.Interface.2.IPv4Address.1.IPAddress"
    },
    "lan.ip.alt": {
        "TR-098": "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.IPAddress",
        "TR-181": "Device.IP.Interface.2.IPv4Address.1.IPAddress"
    },
    "lan.mask": {
        "TR-098": "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.IPInterface.1.IPInterfaceSubnetMask",
        "TR-181": "Device.IP.Interface.2.IPv4Address.1.SubnetMask"
    },
    "lan.mask.alt": {
        "TR-098": "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.SubnetMask",
        "TR-181": "Device.IP.Interface.2.IPv4Address.1.SubnetMask"
    },
    "lan.gateway": {
        "TR-098": "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.IPRouters",
        "TR-181": "Device.Routing.Router.1.IPv4Forwarding.1.GatewayIPAddress"
    },

    # ==================== DHCP ====================
    "lan.dhcp.enable": {
        "TR-098": "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.DHCPServerEnable",
        "TR-181": "Device.DHCPv4.Server.Pool.1.Enable"
    },
    "lan.dhcp.start": {
        "TR-098": "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.MinAddress",
        "TR-181": "Device.DHCPv4.Server.Pool.1.MinAddress"
    },
    "lan.dhcp.end": {
        "TR-098": "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.MaxAddress",
        "TR-181": "Device.DHCPv4.Server.Pool.1.MaxAddress"
    },
    "lan.dhcp.lease": {
        "TR-098": "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.DHCPLeaseTime",
        "TR-181": "Device.DHCPv4.Server.Pool.1.LeaseTime"
    },
    "lan.dhcp.dns": {
        "TR-098": "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.DNSServers",
        "TR-181": "Device.DHCPv4.Server.Pool.1.DNSServers"
    },

    # ==================== WIFI RADIO ====================
    "wifi.radio.enable": {
        "TR-098": "InternetGatewayDevice.LANDevice.1.WLANConfiguration.{radio}.Enable",
        "TR-181": "Device.WiFi.Radio.{radio}.Enable"
    },
    "wifi.radio.channel": {
        "TR-098": "InternetGatewayDevice.LANDevice.1.WLANConfiguration.{radio}.Channel",
        "TR-181": "Device.WiFi.Radio.{radio}.Channel"
    },
    "wifi.radio.auto_channel": {
        "TR-098": "InternetGatewayDevice.LANDevice.1.WLANConfiguration.{radio}.AutoChannelEnable",
        "TR-181": "Device.WiFi.Radio.{radio}.AutoChannelEnable"
    },
    "wifi.radio.bandwidth": {
        "TR-098": "InternetGatewayDevice.LANDevice.1.WLANConfiguration.{radio}.X_TP_Bandwidth",
        "TR-181": "Device.WiFi.Radio.{radio}.OperatingChannelBandwidth"
    },
    "wifi.radio.txpower": {
        "TR-098": "InternetGatewayDevice.LANDevice.1.WLANConfiguration.{radio}.X_TP_TransmitPower",
        "TR-181": "Device.WiFi.Radio.{radio}.TransmitPower"
    },
    "wifi.radio.standard": {
        "TR-098": "InternetGatewayDevice.LANDevice.1.WLANConfiguration.{radio}.Standard",
        "TR-181": "Device.WiFi.Radio.{radio}.OperatingStandards"
    },

    # ==================== WIFI SSID ====================
    "wifi.ssid": {
        "TR-098": "InternetGatewayDevice.LANDevice.1.WLANConfiguration.{radio}.SSID",
        "TR-181": "Device.WiFi.SSID.{radio}.SSID"
    },
    "wifi.ssid.enable": {
        "TR-098": "InternetGatewayDevice.LANDevice.1.WLANConfiguration.{radio}.Enable",
        "TR-181": "Device.WiFi.SSID.{radio}.Enable"
    },
    "wifi.ssid.hidden": {
        "TR-098": "InternetGatewayDevice.LANDevice.1.WLANConfiguration.{radio}.SSIDAdvertisementEnabled",
        "TR-181": "Device.WiFi.AccessPoint.{radio}.SSIDAdvertisementEnabled"
    },

    # ==================== WIFI SECURITY ====================
    "wifi.security.mode": {
        "TR-098": "InternetGatewayDevice.LANDevice.1.WLANConfiguration.{radio}.BeaconType",
        "TR-181": "Device.WiFi.AccessPoint.{radio}.Security.ModeEnabled"
    },
    "wifi.security.mode.alt": {
        "TR-098": "InternetGatewayDevice.LANDevice.1.WLANConfiguration.{radio}.X_TP_SecurityMode",
        "TR-181": "Device.WiFi.AccessPoint.{radio}.Security.ModeEnabled"
    },
    "wifi.security.password": {
        "TR-098": "InternetGatewayDevice.LANDevice.1.WLANConfiguration.{radio}.PreSharedKey",
        "TR-181": "Device.WiFi.AccessPoint.{radio}.Security.KeyPassphrase"
    },
    "wifi.security.password.alt": {
        "TR-098": "InternetGatewayDevice.LANDevice.1.WLANConfiguration.{radio}.X_TP_PreSharedKey",
        "TR-181": "Device.WiFi.AccessPoint.{radio}.Security.KeyPassphrase"
    },
    "wifi.security.encryption": {
        "TR-098": "InternetGatewayDevice.LANDevice.1.WLANConfiguration.{radio}.X_TP_Encryption",
        "TR-181": "Device.WiFi.AccessPoint.{radio}.Security.EncryptionMode"
    },

    # ==================== WIFI ADVANCED ====================
    "wifi.wmm": {
        "TR-098": "InternetGatewayDevice.LANDevice.1.WLANConfiguration.{radio}.WMMEnable",
        "TR-181": "Device.WiFi.AccessPoint.{radio}.WMMEnable"
    },
    "wifi.isolation": {
        "TR-098": "InternetGatewayDevice.LANDevice.1.WLANConfiguration.{radio}.IsolationEnable",
        "TR-181": "Device.WiFi.AccessPoint.{radio}.IsolationEnable"
    },
    "wifi.short_gi": {
        "TR-098": "InternetGatewayDevice.LANDevice.1.WLANConfiguration.{radio}.X_TP_ShortGI",
        "TR-181": "Device.WiFi.Radio.{radio}.GuardInterval"
    },
    "wifi.beacon": {
        "TR-098": "InternetGatewayDevice.LANDevice.1.WLANConfiguration.{radio}.BeaconInterval",
        "TR-181": "Device.WiFi.Radio.{radio}.BeaconPeriod"
    },
    "wifi.rts": {
        "TR-098": "InternetGatewayDevice.LANDevice.1.WLANConfiguration.{radio}.RTSThreshold",
        "TR-181": "Device.WiFi.Radio.{radio}.RTSThreshold"
    },
    "wifi.dtim": {
        "TR-098": "InternetGatewayDevice.LANDevice.1.WLANConfiguration.{radio}.DTIMInterval",
        "TR-181": "Device.WiFi.Radio.{radio}.DTIMPeriod"
    },

    # ==================== WIFI CLIENTS ====================
    "wifi.clients": {
        "TR-098": "InternetGatewayDevice.LANDevice.1.WLANConfiguration.{radio}.AssociatedDevice",
        "TR-181": "Device.WiFi.AccessPoint.{radio}.AssociatedDevice"
    },
    "wifi.clients.count": {
        "TR-098": "InternetGatewayDevice.LANDevice.1.WLANConfiguration.{radio}.TotalAssociations",
        "TR-181": "Device.WiFi.AccessPoint.{radio}.AssociatedDeviceNumberOfEntries"
    },

    # ==================== WIFI WPS ====================
    "wifi.wps.enable": {
        "TR-098": "InternetGatewayDevice.LANDevice.1.WLANConfiguration.{radio}.WPS.Enable",
        "TR-181": "Device.WiFi.AccessPoint.{radio}.WPS.Enable"
    },
    "wifi.wps.pin": {
        "TR-098": "InternetGatewayDevice.LANDevice.1.WLANConfiguration.{radio}.WPS.X_TP_STAEnrolleePIN",
        "TR-181": "Device.WiFi.AccessPoint.{radio}.WPS.PIN"
    },

    # ==================== HOSTS TABLE ====================
    "hosts.table": {
        "TR-098": "InternetGatewayDevice.LANDevice.1.Hosts.Host",
        "TR-181": "Device.Hosts.Host"
    },
    "hosts.count": {
        "TR-098": "InternetGatewayDevice.LANDevice.1.Hosts.HostNumberOfEntries",
        "TR-181": "Device.Hosts.HostNumberOfEntries"
    },

    # ==================== DIAGNOSTICS ====================
    "diag.ping.host": {
        "TR-098": "InternetGatewayDevice.IPPingDiagnostics.Host",
        "TR-181": "Device.IP.Diagnostics.IPPing.Host"
    },
    "diag.ping.count": {
        "TR-098": "InternetGatewayDevice.IPPingDiagnostics.NumberOfRepetitions",
        "TR-181": "Device.IP.Diagnostics.IPPing.NumberOfRepetitions"
    },
    "diag.ping.timeout": {
        "TR-098": "InternetGatewayDevice.IPPingDiagnostics.Timeout",
        "TR-181": "Device.IP.Diagnostics.IPPing.Timeout"
    },
    "diag.ping.state": {
        "TR-098": "InternetGatewayDevice.IPPingDiagnostics.DiagnosticsState",
        "TR-181": "Device.IP.Diagnostics.IPPing.DiagnosticsState"
    },
    "diag.ping.success_count": {
        "TR-098": "InternetGatewayDevice.IPPingDiagnostics.SuccessCount",
        "TR-181": "Device.IP.Diagnostics.IPPing.SuccessCount"
    },
    "diag.ping.failure_count": {
        "TR-098": "InternetGatewayDevice.IPPingDiagnostics.FailureCount",
        "TR-181": "Device.IP.Diagnostics.IPPing.FailureCount"
    },
    "diag.ping.avg_time": {
        "TR-098": "InternetGatewayDevice.IPPingDiagnostics.AverageResponseTime",
        "TR-181": "Device.IP.Diagnostics.IPPing.AverageResponseTime"
    },
    "diag.ping.min_time": {
        "TR-098": "InternetGatewayDevice.IPPingDiagnostics.MinimumResponseTime",
        "TR-181": "Device.IP.Diagnostics.IPPing.MinimumResponseTime"
    },
    "diag.ping.max_time": {
        "TR-098": "InternetGatewayDevice.IPPingDiagnostics.MaximumResponseTime",
        "TR-181": "Device.IP.Diagnostics.IPPing.MaximumResponseTime"
    },

    # ==================== DOWNLOAD DIAGNOSTICS ====================
    "diag.download.url": {
        "TR-098": "InternetGatewayDevice.DownloadDiagnostics.DownloadURL",
        "TR-181": "Device.IP.Diagnostics.DownloadDiagnostics.DownloadURL"
    },
    "diag.download.state": {
        "TR-098": "InternetGatewayDevice.DownloadDiagnostics.DiagnosticsState",
        "TR-181": "Device.IP.Diagnostics.DownloadDiagnostics.DiagnosticsState"
    },
    "diag.download.bytes": {
        "TR-098": "InternetGatewayDevice.DownloadDiagnostics.TestBytesReceived",
        "TR-181": "Device.IP.Diagnostics.DownloadDiagnostics.TestBytesReceived"
    },
    "diag.download.time": {
        "TR-098": "InternetGatewayDevice.DownloadDiagnostics.TotalBytesReceived",
        "TR-181": "Device.IP.Diagnostics.DownloadDiagnostics.TotalBytesReceived"
    },

    # ==================== UPLOAD DIAGNOSTICS ====================
    "diag.upload.url": {
        "TR-098": "InternetGatewayDevice.UploadDiagnostics.UploadURL",
        "TR-181": "Device.IP.Diagnostics.UploadDiagnostics.UploadURL"
    },
    "diag.upload.state": {
        "TR-098": "InternetGatewayDevice.UploadDiagnostics.DiagnosticsState",
        "TR-181": "Device.IP.Diagnostics.UploadDiagnostics.DiagnosticsState"
    },

    # ==================== TRACEROUTE DIAGNOSTICS ====================
    "diag.traceroute.host": {
        "TR-098": "InternetGatewayDevice.TraceRouteDiagnostics.Host",
        "TR-181": "Device.IP.Diagnostics.TraceRoute.Host"
    },
    "diag.traceroute.state": {
        "TR-098": "InternetGatewayDevice.TraceRouteDiagnostics.DiagnosticsState",
        "TR-181": "Device.IP.Diagnostics.TraceRoute.DiagnosticsState"
    },
    "diag.traceroute.hops": {
        "TR-098": "InternetGatewayDevice.TraceRouteDiagnostics.RouteHops",
        "TR-181": "Device.IP.Diagnostics.TraceRoute.RouteHops"
    },

    # ==================== PORT MAPPING (NAT) ====================
    "nat.portmapping": {
        "TR-098": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.PortMapping",
        "TR-181": "Device.NAT.PortMapping"
    },
    "nat.portmapping.enable": {
        "TR-098": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.PortMapping.{idx}.PortMappingEnabled",
        "TR-181": "Device.NAT.PortMapping.{idx}.Enable"
    },
    "nat.portmapping.protocol": {
        "TR-098": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.PortMapping.{idx}.PortMappingProtocol",
        "TR-181": "Device.NAT.PortMapping.{idx}.Protocol"
    },
    "nat.portmapping.external_port": {
        "TR-098": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.PortMapping.{idx}.ExternalPort",
        "TR-181": "Device.NAT.PortMapping.{idx}.ExternalPort"
    },
    "nat.portmapping.internal_port": {
        "TR-098": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.PortMapping.{idx}.InternalPort",
        "TR-181": "Device.NAT.PortMapping.{idx}.InternalPort"
    },
    "nat.portmapping.internal_client": {
        "TR-098": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.PortMapping.{idx}.InternalClient",
        "TR-181": "Device.NAT.PortMapping.{idx}.InternalClient"
    },
    "nat.portmapping.description": {
        "TR-098": "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.PortMapping.{idx}.PortMappingDescription",
        "TR-181": "Device.NAT.PortMapping.{idx}.Description"
    },

    # ==================== ETHERNET INTERFACES ====================
    "eth.interface": {
        "TR-098": "InternetGatewayDevice.LANDevice.1.LANEthernetInterfaceConfig",
        "TR-181": "Device.Ethernet.Interface"
    },
    "eth.status": {
        "TR-098": "InternetGatewayDevice.LANDevice.1.LANEthernetInterfaceConfig.{idx}.Status",
        "TR-181": "Device.Ethernet.Interface.{idx}.Status"
    },
    "eth.mac": {
        "TR-098": "InternetGatewayDevice.LANDevice.1.LANEthernetInterfaceConfig.{idx}.MACAddress",
        "TR-181": "Device.Ethernet.Interface.{idx}.MACAddress"
    },

    # ==================== FIRMWARE UPGRADE ====================
    "firmware.current": {
        "TR-098": "InternetGatewayDevice.DeviceInfo.SoftwareVersion",
        "TR-181": "Device.DeviceInfo.SoftwareVersion"
    },
    "firmware.available": {
        "TR-098": "InternetGatewayDevice.ManagementServer.AvailableFirmwareVersion",
        "TR-181": "Device.DeviceSummary.AvailableFirmwareVersion"
    },

    # ==================== MANAGEMENT SERVER (ACS) ====================
    "acs.url": {
        "TR-098": "InternetGatewayDevice.ManagementServer.URL",
        "TR-181": "Device.ManagementServer.URL"
    },
    "acs.username": {
        "TR-098": "InternetGatewayDevice.ManagementServer.Username",
        "TR-181": "Device.ManagementServer.Username"
    },
    "acs.password": {
        "TR-098": "InternetGatewayDevice.ManagementServer.Password",
        "TR-181": "Device.ManagementServer.Password"
    },
    "acs.periodic_enable": {
        "TR-098": "InternetGatewayDevice.ManagementServer.PeriodicInformEnable",
        "TR-181": "Device.ManagementServer.PeriodicInformEnable"
    },
    "acs.periodic_interval": {
        "TR-098": "InternetGatewayDevice.ManagementServer.PeriodicInformInterval",
        "TR-181": "Device.ManagementServer.PeriodicInformInterval"
    },
}


# =============================================================================
# FABRICANTES E SEUS DATA MODELS
# =============================================================================
MANUFACTURER_MODEL_MAP: Dict[str, DataModel] = {
    # TR-098 (InternetGatewayDevice)
    "tp-link": "TR-098",
    "tplink": "TR-098",
    "tp link": "TR-098",
    "intelbras": "TR-098",
    "multilaser": "TR-098",
    "dlink": "TR-098",
    "d-link": "TR-098",
    "tenda": "TR-098",
    "mercusys": "TR-098",
    "zyxel": "TR-098",
    "netgear": "TR-098",
    "linksys": "TR-098",
    "asus": "TR-098",
    
    # TR-181 (Device)
    "huawei": "TR-181",
    "hua wei": "TR-181",
    "fiberhome": "TR-181",
    "fiber home": "TR-181",
    "zte": "TR-181",  # ZTE moderno usa TR-181
    "nokia": "TR-181",
    "alcatel": "TR-181",
    "alcatel-lucent": "TR-181",
    "calix": "TR-181",
    "sagemcom": "TR-181",
    "technicolor": "TR-181",
    "zhone": "TR-181",
    "adtran": "TR-181",
}


class TR069Normalizer:
    """
    Classe para normalização de parâmetros TR-069 entre TR-098 e TR-181.
    """
    
    PARAM_MAP = PARAM_MAP
    MANUFACTURER_MODEL_MAP = MANUFACTURER_MODEL_MAP
    
    def detect_data_model(self, device: Dict[str, Any]) -> DataModel:
        """
        Detecta o Data Model do dispositivo (TR-098 ou TR-181).
        
        Args:
            device: Dicionário representando o dispositivo
            
        Returns:
            "TR-098" ou "TR-181"
        """
        # 1. Verifica estrutura do objeto (busca recursiva mais tolerante)
        def _contains_key_recursive(obj: Any, key: str) -> bool:
            try:
                if isinstance(obj, dict):
                    if key in obj:
                        return True
                    return any(_contains_key_recursive(v, key) for v in obj.values())
                if isinstance(obj, list):
                    return any(_contains_key_recursive(v, key) for v in obj)
            except Exception:
                return False
            return False

        if _contains_key_recursive(device, "Device") or _contains_key_recursive(device, "DeviceInfo"):
            # prefira TR-181 quando estruturas Device/DeviceInfo aparecerem
            return "TR-181"
        if _contains_key_recursive(device, "InternetGatewayDevice"):
            return "TR-098"
        
        # 2. Verifica pelo fabricante
        device_id = device.get("_deviceId", {})
        manufacturer = str(device_id.get("_Manufacturer", "")).lower().strip()
        
        for key, model in MANUFACTURER_MODEL_MAP.items():
            if key in manufacturer:
                return model
        
        # 3. Verifica pelo ProductClass
        product_class = str(device_id.get("_ProductClass", "")).lower()
        if any(x in product_class for x in ["h196", "f660"]):
            return "TR-098"  # ZTE antigos
        if any(x in product_class for x in ["hg", "eg"]):
            return "TR-181"  # Huawei HG/EG series
        
        # 4. Default: TR-098 (mais comum em ISPs brasileiros)
        return "TR-098"
    
    def get_path(
        self,
        device: Dict[str, Any],
        logical_path: str,
        vars: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Obtém o caminho TR-069 normalizado para um parâmetro lógico.
        
        Args:
            device: Dicionário do dispositivo
            logical_path: Caminho lógico (ex: "wifi.ssid")
            vars: Variáveis para substituição (ex: {"radio": 1})
            
        Returns:
            Caminho TR-069 real
        """
        model = self.detect_data_model(device)
        mapping = PARAM_MAP.get(logical_path, {})

        # Tenta modelo detectado primeiro, depois tenta ambos como fallback
        path = mapping.get(model) or mapping.get("TR-098") or mapping.get("TR-181")

        if not path:
            logger.warning(f"[TR069 Normalizer] Caminho não mapeado: {logical_path} ({model})")
            return logical_path  # Fallback
        
        # Substitui variáveis
        if vars:
            for key, value in vars.items():
                path = re.sub(rf"\{{{key}\}}", str(value), path)
        
        return path
    
    def get_paths(
        self,
        logical_path: str,
        vars: Optional[Dict[str, Any]] = None
    ) -> Tuple[str, str]:
        """
        Obtém o caminho raw para ambos os modelos.
        
        Args:
            logical_path: Caminho lógico
            vars: Variáveis para substituição
            
        Returns:
            Tupla (tr098_path, tr181_path)
        """
        mapping = PARAM_MAP.get(logical_path, {})
        tr098 = mapping.get("TR-098", logical_path)
        tr181 = mapping.get("TR-181", logical_path)
        
        if vars:
            for key, value in vars.items():
                tr098 = re.sub(rf"\{{{key}\}}", str(value), tr098)
                tr181 = re.sub(rf"\{{{key}\}}", str(value), tr181)
        
        return (tr098, tr181)
    
    def get_value(
        self,
        device: Dict[str, Any],
        logical_path: str,
        vars: Optional[Dict[str, Any]] = None,
        default: Any = None
    ) -> Any:
        """
        Lê um valor do device usando caminho normalizado.
        """
        # Primeiro tenta o caminho baseado no modelo detectado, mas se não
        # encontrar valor tenta também o outro modelo (suporta qualquer marca)
        model = self.detect_data_model(device)
        mapping = PARAM_MAP.get(logical_path, {})

        paths_to_try: List[str] = []
        if mapping:
            # ordem: detectado -> TR-098 -> TR-181
            preferred = mapping.get(model)
            other = mapping.get("TR-098") if model == "TR-181" else mapping.get("TR-181")
            if preferred:
                paths_to_try.append(preferred)
            if other and other != preferred:
                paths_to_try.append(other)
        else:
            # sem mapeamento explícito, usa get_path que faz fallback
            paths_to_try.append(self.get_path(device, logical_path, vars))

        # aplica vars e tenta cada caminho
        for p in paths_to_try:
            if vars:
                for key, value in vars.items():
                    p = re.sub(rf"\{{{key}\}}", str(value), p)
            val = self.get_value_by_path(device, p, None)
            if val is not None and val != "":
                return val

        # por fim tenta caminho literal
        try:
            final_path = self.get_path(device, logical_path, vars)
            return self.get_value_by_path(device, final_path, default)
        except Exception:
            return default
    
    def get_value_by_path(
        self,
        device: Dict[str, Any],
        path: str,
        default: Any = None
    ) -> Any:
        """
        Lê um valor do device usando caminho literal.
        """
        try:
            parts = path.split(".")
            current = device
            
            for part in parts:
                if current is None:
                    return default
                current = current.get(part) if isinstance(current, dict) else None
            
            # GenieACS armazena valores em _value
            if isinstance(current, dict) and "_value" in current:
                return current["_value"]
            
            return current if current is not None else default
        except Exception:
            return default
    
    def get_value_multi(
        self,
        device: Dict[str, Any],
        logical_paths: List[str],
        vars: Optional[Dict[str, Any]] = None,
        default: Any = None
    ) -> Any:
        """
        Tenta ler de múltiplos caminhos (fallback).
        """
        for logical_path in logical_paths:
            value = self.get_value(device, logical_path, vars)
            if value is not None and value != "":
                return value
        return default
    
    def build_set_params(
        self,
        device: Dict[str, Any],
        params: List[Dict[str, Any]]
    ) -> List[List[str]]:
        """
        Gera array de parâmetros para setParameterValues com normalização.
        
        Args:
            device: Dispositivo
            params: Lista de {"path": str, "value": Any, "type"?: str, "vars"?: dict}
            
        Returns:
            Lista de [path, value, type]
        """
        result = []
        for param in params:
            path = self.get_path(device, param["path"], param.get("vars"))
            value = str(param["value"])
            xsd_type = param.get("type") or self.infer_xsd_type(param["value"])
            result.append([path, value, xsd_type])
        return result
    
    def infer_xsd_type(self, value: Any) -> str:
        """
        Infere o tipo XSD baseado no valor.
        """
        if isinstance(value, bool):
            return "xsd:boolean"
        if isinstance(value, int):
            return "xsd:unsignedInt"
        if isinstance(value, float):
            return "xsd:string"
        return "xsd:string"
    
    def has_parameter(
        self,
        device: Dict[str, Any],
        logical_path: str,
        vars: Optional[Dict[str, Any]] = None
    ) -> bool:
        """
        Verifica se o device suporta determinado parâmetro.
        """
        value = self.get_value(device, logical_path, vars)
        return value is not None
    
    def get_data_model_info(self, device: Dict[str, Any]) -> Dict[str, str]:
        """
        Obtém informações do modelo de dados.
        """
        device_id = device.get("_deviceId", {})
        return {
            "model": self.detect_data_model(device),
            "manufacturer": device_id.get("_Manufacturer", "Unknown"),
            "product_class": device_id.get("_ProductClass", "Unknown"),
            "serial": device_id.get("_SerialNumber", "Unknown"),
        }
    
    def list_paths(self, category: Optional[str] = None) -> List[str]:
        """
        Lista todos os caminhos lógicos disponíveis.
        
        Args:
            category: Filtrar por categoria (device, wan, lan, wifi, etc.)
        """
        paths = list(PARAM_MAP.keys())
        
        if category:
            paths = [p for p in paths if p.startswith(f"{category}.")]
        
        return sorted(paths)
    
    # =========================================================================
    # HELPERS ESPECÍFICOS
    # =========================================================================
    
    def get_wifi_params(
        self,
        device: Dict[str, Any],
        radio: int = 1
    ) -> Dict[str, Any]:
        """
        Obtém parâmetros de Wi-Fi normalizados para um rádio específico.
        """
        vars = {"radio": radio}
        return {
            "enabled": self.get_value(device, "wifi.radio.enable", vars, False),
            "ssid": self.get_value(device, "wifi.ssid", vars, ""),
            "password": self.get_value_multi(
                device,
                ["wifi.security.password", "wifi.security.password.alt"],
                vars,
                ""
            ),
            "channel": self.get_value(device, "wifi.radio.channel", vars, "Auto"),
            "auto_channel": self.get_value(device, "wifi.radio.auto_channel", vars, True),
            "bandwidth": self.get_value(device, "wifi.radio.bandwidth", vars, "Auto"),
            "tx_power": self.get_value(device, "wifi.radio.txpower", vars, 100),
            "security_mode": self.get_value_multi(
                device,
                ["wifi.security.mode", "wifi.security.mode.alt"],
                vars,
                "WPA2"
            ),
            "encryption": self.get_value(device, "wifi.security.encryption", vars, "AES"),
            "hidden": not self.get_value(device, "wifi.ssid.hidden", vars, True),
            "wmm": self.get_value(device, "wifi.wmm", vars, True),
            "isolation": self.get_value(device, "wifi.isolation", vars, False),
        }
    
    def get_lan_params(self, device: Dict[str, Any]) -> Dict[str, Any]:
        """
        Obtém parâmetros de LAN normalizados.
        """
        return {
            "ip": self.get_value_multi(device, ["lan.ip", "lan.ip.alt"], None, "192.168.1.1"),
            "mask": self.get_value_multi(device, ["lan.mask", "lan.mask.alt"], None, "255.255.255.0"),
            "gateway": self.get_value(device, "lan.gateway", None, ""),
            "dhcp_enabled": self.get_value(device, "lan.dhcp.enable", None, True),
            "dhcp_start": self.get_value(device, "lan.dhcp.start", None, ""),
            "dhcp_end": self.get_value(device, "lan.dhcp.end", None, ""),
            "dhcp_lease": self.get_value(device, "lan.dhcp.lease", None, 86400),
            "dns_servers": self.get_value(device, "lan.dhcp.dns", None, ""),
        }
    
    def get_wan_params(self, device: Dict[str, Any]) -> Dict[str, Any]:
        """
        Obtém parâmetros de WAN normalizados.
        """
        return {
            "ppp_username": self.get_value(device, "wan.ppp.username", None, ""),
            "ppp_status": self.get_value(device, "wan.ppp.status", None, ""),
            "ip_address": self.get_value_multi(
                device,
                ["wan.ppp.ip", "wan.ip.address"],
                None,
                ""
            ),
            "ipv6_address": self.get_value(device, "wan.ipv6.address", None, ""),
            "gateway": self.get_value(device, "wan.ip.gateway", None, ""),
            "dns": self.get_value(device, "wan.ip.dns", None, ""),
            "uptime": self.get_value_multi(device, ["wan.ppp.uptime", "device.uptime"], None, 0),
            "rx_bytes": self.get_value(device, "wan.stats.rx_bytes", None, 0),
            "tx_bytes": self.get_value(device, "wan.stats.tx_bytes", None, 0),
        }
    
    def get_ping_diag_params(self, device: Dict[str, Any]) -> Dict[str, Any]:
        """
        Obtém parâmetros de diagnóstico Ping normalizados.
        """
        return {
            "host": self.get_value(device, "diag.ping.host", None, ""),
            "state": self.get_value(device, "diag.ping.state", None, ""),
            "success_count": self.get_value(device, "diag.ping.success_count", None, 0),
            "failure_count": self.get_value(device, "diag.ping.failure_count", None, 0),
            "avg_time": self.get_value(device, "diag.ping.avg_time", None, 0),
            "min_time": self.get_value(device, "diag.ping.min_time", None, 0),
            "max_time": self.get_value(device, "diag.ping.max_time", None, 0),
        }


# Instância singleton para uso direto
normalizer = TR069Normalizer()
