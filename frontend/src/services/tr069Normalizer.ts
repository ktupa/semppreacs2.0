// src/services/tr069Normalizer.ts
// Sistema de Normalização TR-069 para suporte a TR-098 (TP-Link/Intelbras/ZTE) e TR-181 (Huawei/Fiberhome)

export type DataModel = 'TR-098' | 'TR-181';

export interface ParamMapping {
  'TR-098': string;
  'TR-181': string;
}

// =============================================================================
// MAPEAMENTO COMPLETO DE PARÂMETROS TR-098 ↔ TR-181
// =============================================================================
export const PARAM_MAP: Record<string, ParamMapping> = {
  // ==================== DEVICE INFO ====================
  'device.manufacturer': {
    'TR-098': 'InternetGatewayDevice.DeviceInfo.Manufacturer',
    'TR-181': 'Device.DeviceInfo.Manufacturer'
  },
  'device.model': {
    'TR-098': 'InternetGatewayDevice.DeviceInfo.ModelName',
    'TR-181': 'Device.DeviceInfo.ModelName'
  },
  'device.serial': {
    'TR-098': 'InternetGatewayDevice.DeviceInfo.SerialNumber',
    'TR-181': 'Device.DeviceInfo.SerialNumber'
  },
  'device.firmware': {
    'TR-098': 'InternetGatewayDevice.DeviceInfo.SoftwareVersion',
    'TR-181': 'Device.DeviceInfo.SoftwareVersion'
  },
  'device.uptime': {
    'TR-098': 'InternetGatewayDevice.DeviceInfo.UpTime',
    'TR-181': 'Device.DeviceInfo.UpTime'
  },
  'device.hardware': {
    'TR-098': 'InternetGatewayDevice.DeviceInfo.HardwareVersion',
    'TR-181': 'Device.DeviceInfo.HardwareVersion'
  },
  'device.reboot': {
    'TR-098': 'InternetGatewayDevice.X_TP_Reboot',
    'TR-181': 'Device.Reboot'
  },

  // ==================== WAN PPP ====================
  'wan.ppp.username': {
    'TR-098': 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Username',
    'TR-181': 'Device.PPP.Interface.1.Username'
  },
  'wan.ppp.password': {
    'TR-098': 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Password',
    'TR-181': 'Device.PPP.Interface.1.Password'
  },
  'wan.ppp.ip': {
    'TR-098': 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.ExternalIPAddress',
    'TR-181': 'Device.PPP.Interface.1.IPCP.LocalIPAddress'
  },
  'wan.ppp.status': {
    'TR-098': 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.ConnectionStatus',
    'TR-181': 'Device.PPP.Interface.1.Status'
  },
  'wan.ppp.uptime': {
    'TR-098': 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Uptime',
    'TR-181': 'Device.PPP.Interface.1.Stats.ConnectionUptime'
  },

  // ==================== WAN IP ====================
  'wan.ip.address': {
    'TR-098': 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.ExternalIPAddress',
    'TR-181': 'Device.IP.Interface.1.IPv4Address.1.IPAddress'
  },
  'wan.ip.gateway': {
    'TR-098': 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.DefaultGateway',
    'TR-181': 'Device.Routing.Router.1.IPv4Forwarding.1.GatewayIPAddress'
  },
  'wan.ip.dns': {
    'TR-098': 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.DNSServers',
    'TR-181': 'Device.DNS.Client.Server.1.DNSServer'
  },

  // ==================== WAN IPv6 ====================
  'wan.ipv6.address': {
    'TR-098': 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.X_HW_IPv6Address',
    'TR-181': 'Device.IP.Interface.1.IPv6Address.1.IPAddress'
  },
  'wan.ipv6.prefix': {
    'TR-098': 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.X_TP_IPv6PrefixList',
    'TR-181': 'Device.IP.Interface.1.IPv6Prefix.1.Prefix'
  },
  'wan.ipv6.enable': {
    'TR-098': 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.X_TPLINK_IPv6Enable',
    'TR-181': 'Device.IP.Interface.1.IPv6Enable'
  },

  // ==================== WAN STATS ====================
  'wan.stats.rx_bytes': {
    'TR-098': 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Stats.EthernetBytesReceived',
    'TR-181': 'Device.PPP.Interface.1.Stats.BytesReceived'
  },
  'wan.stats.tx_bytes': {
    'TR-098': 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Stats.EthernetBytesSent',
    'TR-181': 'Device.PPP.Interface.1.Stats.BytesSent'
  },

  // ==================== LAN ====================
  'lan.ip': {
    'TR-098': 'InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.IPInterface.1.IPInterfaceIPAddress',
    'TR-181': 'Device.IP.Interface.2.IPv4Address.1.IPAddress'
  },
  'lan.ip.alt': {
    'TR-098': 'InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.IPAddress',
    'TR-181': 'Device.IP.Interface.2.IPv4Address.1.IPAddress'
  },
  'lan.mask': {
    'TR-098': 'InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.IPInterface.1.IPInterfaceSubnetMask',
    'TR-181': 'Device.IP.Interface.2.IPv4Address.1.SubnetMask'
  },
  'lan.mask.alt': {
    'TR-098': 'InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.SubnetMask',
    'TR-181': 'Device.IP.Interface.2.IPv4Address.1.SubnetMask'
  },
  'lan.gateway': {
    'TR-098': 'InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.IPRouters',
    'TR-181': 'Device.Routing.Router.1.IPv4Forwarding.1.GatewayIPAddress'
  },

  // ==================== DHCP ====================
  'lan.dhcp.enable': {
    'TR-098': 'InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.DHCPServerEnable',
    'TR-181': 'Device.DHCPv4.Server.Pool.1.Enable'
  },
  'lan.dhcp.start': {
    'TR-098': 'InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.MinAddress',
    'TR-181': 'Device.DHCPv4.Server.Pool.1.MinAddress'
  },
  'lan.dhcp.end': {
    'TR-098': 'InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.MaxAddress',
    'TR-181': 'Device.DHCPv4.Server.Pool.1.MaxAddress'
  },
  'lan.dhcp.lease': {
    'TR-098': 'InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.DHCPLeaseTime',
    'TR-181': 'Device.DHCPv4.Server.Pool.1.LeaseTime'
  },
  'lan.dhcp.dns': {
    'TR-098': 'InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.DNSServers',
    'TR-181': 'Device.DHCPv4.Server.Pool.1.DNSServers'
  },

  // ==================== WIFI RADIO ====================
  'wifi.radio.enable': {
    'TR-098': 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.{radio}.Enable',
    'TR-181': 'Device.WiFi.Radio.{radio}.Enable'
  },
  'wifi.radio.channel': {
    'TR-098': 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.{radio}.Channel',
    'TR-181': 'Device.WiFi.Radio.{radio}.Channel'
  },
  'wifi.radio.auto_channel': {
    'TR-098': 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.{radio}.AutoChannelEnable',
    'TR-181': 'Device.WiFi.Radio.{radio}.AutoChannelEnable'
  },
  'wifi.radio.bandwidth': {
    'TR-098': 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.{radio}.X_TP_Bandwidth',
    'TR-181': 'Device.WiFi.Radio.{radio}.OperatingChannelBandwidth'
  },
  'wifi.radio.txpower': {
    'TR-098': 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.{radio}.X_TP_TransmitPower',
    'TR-181': 'Device.WiFi.Radio.{radio}.TransmitPower'
  },
  'wifi.radio.standard': {
    'TR-098': 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.{radio}.Standard',
    'TR-181': 'Device.WiFi.Radio.{radio}.OperatingStandards'
  },

  // ==================== WIFI SSID ====================
  'wifi.ssid': {
    'TR-098': 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.{radio}.SSID',
    'TR-181': 'Device.WiFi.SSID.{radio}.SSID'
  },
  'wifi.ssid.enable': {
    'TR-098': 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.{radio}.Enable',
    'TR-181': 'Device.WiFi.SSID.{radio}.Enable'
  },
  'wifi.ssid.hidden': {
    'TR-098': 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.{radio}.SSIDAdvertisementEnabled',
    'TR-181': 'Device.WiFi.AccessPoint.{radio}.SSIDAdvertisementEnabled'
  },

  // ==================== WIFI SECURITY ====================
  'wifi.security.mode': {
    'TR-098': 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.{radio}.BeaconType',
    'TR-181': 'Device.WiFi.AccessPoint.{radio}.Security.ModeEnabled'
  },
  'wifi.security.mode.alt': {
    'TR-098': 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.{radio}.X_TP_SecurityMode',
    'TR-181': 'Device.WiFi.AccessPoint.{radio}.Security.ModeEnabled'
  },
  'wifi.security.password': {
    'TR-098': 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.{radio}.PreSharedKey',
    'TR-181': 'Device.WiFi.AccessPoint.{radio}.Security.KeyPassphrase'
  },
  'wifi.security.password.alt': {
    'TR-098': 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.{radio}.X_TP_PreSharedKey',
    'TR-181': 'Device.WiFi.AccessPoint.{radio}.Security.KeyPassphrase'
  },
  'wifi.security.encryption': {
    'TR-098': 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.{radio}.X_TP_Encryption',
    'TR-181': 'Device.WiFi.AccessPoint.{radio}.Security.EncryptionMode'
  },

  // ==================== WIFI ADVANCED ====================
  'wifi.wmm': {
    'TR-098': 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.{radio}.WMMEnable',
    'TR-181': 'Device.WiFi.AccessPoint.{radio}.WMMEnable'
  },
  'wifi.isolation': {
    'TR-098': 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.{radio}.IsolationEnable',
    'TR-181': 'Device.WiFi.AccessPoint.{radio}.IsolationEnable'
  },
  'wifi.short_gi': {
    'TR-098': 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.{radio}.X_TP_ShortGI',
    'TR-181': 'Device.WiFi.Radio.{radio}.GuardInterval'
  },
  'wifi.beacon': {
    'TR-098': 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.{radio}.BeaconInterval',
    'TR-181': 'Device.WiFi.Radio.{radio}.BeaconPeriod'
  },
  'wifi.rts': {
    'TR-098': 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.{radio}.RTSThreshold',
    'TR-181': 'Device.WiFi.Radio.{radio}.RTSThreshold'
  },
  'wifi.dtim': {
    'TR-098': 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.{radio}.DTIMInterval',
    'TR-181': 'Device.WiFi.Radio.{radio}.DTIMPeriod'
  },

  // ==================== WIFI CLIENTS ====================
  'wifi.clients': {
    'TR-098': 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.{radio}.AssociatedDevice',
    'TR-181': 'Device.WiFi.AccessPoint.{radio}.AssociatedDevice'
  },
  'wifi.clients.count': {
    'TR-098': 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.{radio}.TotalAssociations',
    'TR-181': 'Device.WiFi.AccessPoint.{radio}.AssociatedDeviceNumberOfEntries'
  },

  // ==================== WIFI WPS ====================
  'wifi.wps.enable': {
    'TR-098': 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.{radio}.WPS.Enable',
    'TR-181': 'Device.WiFi.AccessPoint.{radio}.WPS.Enable'
  },
  'wifi.wps.pin': {
    'TR-098': 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.{radio}.WPS.X_TP_STAEnrolleePIN',
    'TR-181': 'Device.WiFi.AccessPoint.{radio}.WPS.PIN'
  },

  // ==================== HOSTS TABLE ====================
  'hosts.table': {
    'TR-098': 'InternetGatewayDevice.LANDevice.1.Hosts.Host',
    'TR-181': 'Device.Hosts.Host'
  },
  'hosts.count': {
    'TR-098': 'InternetGatewayDevice.LANDevice.1.Hosts.HostNumberOfEntries',
    'TR-181': 'Device.Hosts.HostNumberOfEntries'
  },

  // ==================== DIAGNOSTICS ====================
  'diag.ping.host': {
    'TR-098': 'InternetGatewayDevice.IPPingDiagnostics.Host',
    'TR-181': 'Device.IP.Diagnostics.IPPing.Host'
  },
  'diag.ping.count': {
    'TR-098': 'InternetGatewayDevice.IPPingDiagnostics.NumberOfRepetitions',
    'TR-181': 'Device.IP.Diagnostics.IPPing.NumberOfRepetitions'
  },
  'diag.ping.timeout': {
    'TR-098': 'InternetGatewayDevice.IPPingDiagnostics.Timeout',
    'TR-181': 'Device.IP.Diagnostics.IPPing.Timeout'
  },
  'diag.ping.state': {
    'TR-098': 'InternetGatewayDevice.IPPingDiagnostics.DiagnosticsState',
    'TR-181': 'Device.IP.Diagnostics.IPPing.DiagnosticsState'
  },
  'diag.ping.success_count': {
    'TR-098': 'InternetGatewayDevice.IPPingDiagnostics.SuccessCount',
    'TR-181': 'Device.IP.Diagnostics.IPPing.SuccessCount'
  },
  'diag.ping.failure_count': {
    'TR-098': 'InternetGatewayDevice.IPPingDiagnostics.FailureCount',
    'TR-181': 'Device.IP.Diagnostics.IPPing.FailureCount'
  },
  'diag.ping.avg_time': {
    'TR-098': 'InternetGatewayDevice.IPPingDiagnostics.AverageResponseTime',
    'TR-181': 'Device.IP.Diagnostics.IPPing.AverageResponseTime'
  },
  'diag.ping.min_time': {
    'TR-098': 'InternetGatewayDevice.IPPingDiagnostics.MinimumResponseTime',
    'TR-181': 'Device.IP.Diagnostics.IPPing.MinimumResponseTime'
  },
  'diag.ping.max_time': {
    'TR-098': 'InternetGatewayDevice.IPPingDiagnostics.MaximumResponseTime',
    'TR-181': 'Device.IP.Diagnostics.IPPing.MaximumResponseTime'
  },

  // ==================== DOWNLOAD DIAGNOSTICS ====================
  'diag.download.url': {
    'TR-098': 'InternetGatewayDevice.DownloadDiagnostics.DownloadURL',
    'TR-181': 'Device.IP.Diagnostics.DownloadDiagnostics.DownloadURL'
  },
  'diag.download.state': {
    'TR-098': 'InternetGatewayDevice.DownloadDiagnostics.DiagnosticsState',
    'TR-181': 'Device.IP.Diagnostics.DownloadDiagnostics.DiagnosticsState'
  },
  'diag.download.bytes': {
    'TR-098': 'InternetGatewayDevice.DownloadDiagnostics.TestBytesReceived',
    'TR-181': 'Device.IP.Diagnostics.DownloadDiagnostics.TestBytesReceived'
  },
  'diag.download.time': {
    'TR-098': 'InternetGatewayDevice.DownloadDiagnostics.TotalBytesReceived',
    'TR-181': 'Device.IP.Diagnostics.DownloadDiagnostics.TotalBytesReceived'
  },

  // ==================== UPLOAD DIAGNOSTICS ====================
  'diag.upload.url': {
    'TR-098': 'InternetGatewayDevice.UploadDiagnostics.UploadURL',
    'TR-181': 'Device.IP.Diagnostics.UploadDiagnostics.UploadURL'
  },
  'diag.upload.state': {
    'TR-098': 'InternetGatewayDevice.UploadDiagnostics.DiagnosticsState',
    'TR-181': 'Device.IP.Diagnostics.UploadDiagnostics.DiagnosticsState'
  },

  // ==================== TRACEROUTE DIAGNOSTICS ====================
  'diag.traceroute.host': {
    'TR-098': 'InternetGatewayDevice.TraceRouteDiagnostics.Host',
    'TR-181': 'Device.IP.Diagnostics.TraceRoute.Host'
  },
  'diag.traceroute.state': {
    'TR-098': 'InternetGatewayDevice.TraceRouteDiagnostics.DiagnosticsState',
    'TR-181': 'Device.IP.Diagnostics.TraceRoute.DiagnosticsState'
  },
  'diag.traceroute.hops': {
    'TR-098': 'InternetGatewayDevice.TraceRouteDiagnostics.RouteHops',
    'TR-181': 'Device.IP.Diagnostics.TraceRoute.RouteHops'
  },

  // ==================== PORT MAPPING (NAT) ====================
  'nat.portmapping': {
    'TR-098': 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.PortMapping',
    'TR-181': 'Device.NAT.PortMapping'
  },
  'nat.portmapping.enable': {
    'TR-098': 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.PortMapping.{idx}.PortMappingEnabled',
    'TR-181': 'Device.NAT.PortMapping.{idx}.Enable'
  },
  'nat.portmapping.protocol': {
    'TR-098': 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.PortMapping.{idx}.PortMappingProtocol',
    'TR-181': 'Device.NAT.PortMapping.{idx}.Protocol'
  },
  'nat.portmapping.external_port': {
    'TR-098': 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.PortMapping.{idx}.ExternalPort',
    'TR-181': 'Device.NAT.PortMapping.{idx}.ExternalPort'
  },
  'nat.portmapping.internal_port': {
    'TR-098': 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.PortMapping.{idx}.InternalPort',
    'TR-181': 'Device.NAT.PortMapping.{idx}.InternalPort'
  },
  'nat.portmapping.internal_client': {
    'TR-098': 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.PortMapping.{idx}.InternalClient',
    'TR-181': 'Device.NAT.PortMapping.{idx}.InternalClient'
  },
  'nat.portmapping.description': {
    'TR-098': 'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.PortMapping.{idx}.PortMappingDescription',
    'TR-181': 'Device.NAT.PortMapping.{idx}.Description'
  },

  // ==================== ETHERNET INTERFACES ====================
  'eth.interface': {
    'TR-098': 'InternetGatewayDevice.LANDevice.1.LANEthernetInterfaceConfig',
    'TR-181': 'Device.Ethernet.Interface'
  },
  'eth.status': {
    'TR-098': 'InternetGatewayDevice.LANDevice.1.LANEthernetInterfaceConfig.{idx}.Status',
    'TR-181': 'Device.Ethernet.Interface.{idx}.Status'
  },
  'eth.mac': {
    'TR-098': 'InternetGatewayDevice.LANDevice.1.LANEthernetInterfaceConfig.{idx}.MACAddress',
    'TR-181': 'Device.Ethernet.Interface.{idx}.MACAddress'
  },

  // ==================== FIRMWARE UPGRADE ====================
  'firmware.current': {
    'TR-098': 'InternetGatewayDevice.DeviceInfo.SoftwareVersion',
    'TR-181': 'Device.DeviceInfo.SoftwareVersion'
  },
  'firmware.available': {
    'TR-098': 'InternetGatewayDevice.ManagementServer.AvailableFirmwareVersion',
    'TR-181': 'Device.DeviceSummary.AvailableFirmwareVersion'
  },

  // ==================== MANAGEMENT SERVER (ACS) ====================
  'acs.url': {
    'TR-098': 'InternetGatewayDevice.ManagementServer.URL',
    'TR-181': 'Device.ManagementServer.URL'
  },
  'acs.username': {
    'TR-098': 'InternetGatewayDevice.ManagementServer.Username',
    'TR-181': 'Device.ManagementServer.Username'
  },
  'acs.password': {
    'TR-098': 'InternetGatewayDevice.ManagementServer.Password',
    'TR-181': 'Device.ManagementServer.Password'
  },
  'acs.periodic_enable': {
    'TR-098': 'InternetGatewayDevice.ManagementServer.PeriodicInformEnable',
    'TR-181': 'Device.ManagementServer.PeriodicInformEnable'
  },
  'acs.periodic_interval': {
    'TR-098': 'InternetGatewayDevice.ManagementServer.PeriodicInformInterval',
    'TR-181': 'Device.ManagementServer.PeriodicInformInterval'
  }
};

// =============================================================================
// FABRICANTES E SEUS DATA MODELS
// =============================================================================
const MANUFACTURER_MODEL_MAP: Record<string, DataModel> = {
  // TR-098 (InternetGatewayDevice)
  'tp-link': 'TR-098',
  'tplink': 'TR-098',
  'tp link': 'TR-098',
  'intelbras': 'TR-098',
  'multilaser': 'TR-098',
  'dlink': 'TR-098',
  'd-link': 'TR-098',
  'tenda': 'TR-098',
  'mercusys': 'TR-098',
  'zyxel': 'TR-098',
  'netgear': 'TR-098',
  'linksys': 'TR-098',
  'asus': 'TR-098',
  
  // TR-181 (Device)
  'huawei': 'TR-181',
  'hua wei': 'TR-181',
  'fiberhome': 'TR-181',
  'fiber home': 'TR-181',
  'zte': 'TR-181', // ZTE moderno usa TR-181
  'nokia': 'TR-181',
  'alcatel': 'TR-181',
  'alcatel-lucent': 'TR-181',
  'calix': 'TR-181',
  'sagemcom': 'TR-181',
  'technicolor': 'TR-181',
  'zhone': 'TR-181',
  'adtran': 'TR-181',
};

// =============================================================================
// FUNÇÕES DE DETECÇÃO E NORMALIZAÇÃO
// =============================================================================

/**
 * Detecta o Data Model do dispositivo (TR-098 ou TR-181)
 */
export function detectDataModel(device: any): DataModel {
  // 1. Verifica estrutura do objeto
  if (device?.Device?.DeviceInfo) {
    return 'TR-181';
  }
  if (device?.InternetGatewayDevice?.DeviceInfo) {
    return 'TR-098';
  }
  
  // 2. Verifica pelo fabricante
  const manufacturer = (
    device?._deviceId?._Manufacturer ||
    device?.DeviceInfo?.Manufacturer ||
    ''
  ).toLowerCase().trim();
  
  for (const [key, model] of Object.entries(MANUFACTURER_MODEL_MAP)) {
    if (manufacturer.includes(key)) {
      return model;
    }
  }
  
  // 3. Verifica pelo ProductClass (alguns ZTE antigos usam TR-098)
  const productClass = (device?._deviceId?._ProductClass || '').toLowerCase();
  if (productClass.includes('h196') || productClass.includes('f660')) {
    return 'TR-098'; // ZTE antigos
  }
  if (productClass.includes('hg') || productClass.includes('eg')) {
    return 'TR-181'; // Huawei HG/EG series
  }
  
  // 4. Default: TR-098 (mais comum em ISPs brasileiros)
  return 'TR-098';
}

/**
 * Obtém o caminho TR-069 normalizado para um parâmetro lógico
 */
export function getPath(
  device: any,
  logicalPath: string,
  vars?: Record<string, string | number>
): string {
  const model = detectDataModel(device);
  let path = PARAM_MAP[logicalPath]?.[model];
  
  if (!path) {
    console.warn(`[TR069 Normalizer] Caminho não mapeado: ${logicalPath} (${model})`);
    return logicalPath; // Fallback: retorna o próprio path
  }
  
  // Substitui variáveis como {radio}, {idx}, etc.
  if (vars) {
    Object.entries(vars).forEach(([key, value]) => {
      path = path.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value));
    });
  }
  
  return path;
}

/**
 * Obtém o caminho raw para ambos os modelos (útil para fallback)
 */
export function getPaths(
  logicalPath: string,
  vars?: Record<string, string | number>
): { tr098: string; tr181: string } {
  let tr098 = PARAM_MAP[logicalPath]?.['TR-098'] || logicalPath;
  let tr181 = PARAM_MAP[logicalPath]?.['TR-181'] || logicalPath;
  
  if (vars) {
    Object.entries(vars).forEach(([key, value]) => {
      tr098 = tr098.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value));
      tr181 = tr181.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value));
    });
  }
  
  return { tr098, tr181 };
}

/**
 * Lê um valor do device usando caminho normalizado
 */
export function getValue(
  device: any,
  logicalPath: string,
  vars?: Record<string, string | number>,
  defaultValue?: any
): any {
  const path = getPath(device, logicalPath, vars);
  return getValueByPath(device, path, defaultValue);
}

/**
 * Lê um valor do device usando caminho literal
 */
export function getValueByPath(device: any, path: string, defaultValue?: any): any {
  try {
    const parts = path.split('.');
    let current: any = device;
    
    for (const part of parts) {
      if (current === undefined || current === null) {
        return defaultValue;
      }
      current = current[part];
    }
    
    // GenieACS armazena valores em _value
    const value = current?._value ?? current;
    return value ?? defaultValue;
  } catch {
    return defaultValue;
  }
}

/**
 * Tenta ler de múltiplos caminhos (fallback)
 */
export function getValueMulti(
  device: any,
  logicalPaths: string[],
  vars?: Record<string, string | number>,
  defaultValue?: any
): any {
  for (const logicalPath of logicalPaths) {
    const value = getValue(device, logicalPath, vars);
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }
  return defaultValue;
}

/**
 * Gera array de parâmetros para setParameterValues com normalização
 */
export function buildSetParams(
  device: any,
  params: Array<{
    path: string;
    value: string | number | boolean;
    type?: string;
    vars?: Record<string, string | number>;
  }>
): Array<[string, string, string]> {
  return params.map(({ path, value, type, vars }) => {
    const normalizedPath = getPath(device, path, vars);
    const valueStr = String(value);
    const xsdType = type || inferXsdType(value);
    return [normalizedPath, valueStr, xsdType];
  });
}

/**
 * Infere o tipo XSD baseado no valor
 */
export function inferXsdType(value: any): string {
  if (typeof value === 'boolean') return 'xsd:boolean';
  if (typeof value === 'number') {
    return Number.isInteger(value) ? 'xsd:unsignedInt' : 'xsd:string';
  }
  return 'xsd:string';
}

/**
 * Verifica se o device suporta determinado parâmetro
 */
export function hasParameter(device: any, logicalPath: string, vars?: Record<string, string | number>): boolean {
  const value = getValue(device, logicalPath, vars);
  return value !== undefined && value !== null;
}

/**
 * Obtém informações do modelo de dados
 */
export function getDataModelInfo(device: any): {
  model: DataModel;
  manufacturer: string;
  productClass: string;
  serial: string;
} {
  return {
    model: detectDataModel(device),
    manufacturer: device?._deviceId?._Manufacturer || 'Unknown',
    productClass: device?._deviceId?._ProductClass || 'Unknown',
    serial: device?._deviceId?._SerialNumber || 'Unknown',
  };
}

// =============================================================================
// HELPERS ESPECÍFICOS
// =============================================================================

/**
 * Obtém parâmetros de Wi-Fi normalizados para um rádio específico
 */
export function getWifiParams(device: any, radio: 1 | 2 = 1) {
  const vars = { radio };
  return {
    enabled: getValue(device, 'wifi.radio.enable', vars, false),
    ssid: getValue(device, 'wifi.ssid', vars, ''),
    password: getValueMulti(device, ['wifi.security.password', 'wifi.security.password.alt'], vars, ''),
    channel: getValue(device, 'wifi.radio.channel', vars, 'Auto'),
    autoChannel: getValue(device, 'wifi.radio.auto_channel', vars, true),
    bandwidth: getValue(device, 'wifi.radio.bandwidth', vars, 'Auto'),
    txPower: getValue(device, 'wifi.radio.txpower', vars, 100),
    securityMode: getValueMulti(device, ['wifi.security.mode', 'wifi.security.mode.alt'], vars, 'WPA2'),
    encryption: getValue(device, 'wifi.security.encryption', vars, 'AES'),
    hidden: !getValue(device, 'wifi.ssid.hidden', vars, true), // Invertido: SSIDAdvertisementEnabled
    wmm: getValue(device, 'wifi.wmm', vars, true),
    isolation: getValue(device, 'wifi.isolation', vars, false),
  };
}

/**
 * Obtém parâmetros de LAN normalizados
 */
export function getLanParams(device: any) {
  return {
    ip: getValueMulti(device, ['lan.ip', 'lan.ip.alt'], undefined, '192.168.1.1'),
    mask: getValueMulti(device, ['lan.mask', 'lan.mask.alt'], undefined, '255.255.255.0'),
    gateway: getValue(device, 'lan.gateway', undefined, ''),
    dhcpEnabled: getValue(device, 'lan.dhcp.enable', undefined, true),
    dhcpStart: getValue(device, 'lan.dhcp.start', undefined, ''),
    dhcpEnd: getValue(device, 'lan.dhcp.end', undefined, ''),
    dhcpLease: getValue(device, 'lan.dhcp.lease', undefined, 86400),
    dnsServers: getValue(device, 'lan.dhcp.dns', undefined, ''),
  };
}

/**
 * Obtém parâmetros de WAN normalizados
 */
export function getWanParams(device: any) {
  return {
    pppUsername: getValue(device, 'wan.ppp.username', undefined, ''),
    pppStatus: getValue(device, 'wan.ppp.status', undefined, ''),
    ipAddress: getValueMulti(device, ['wan.ppp.ip', 'wan.ip.address'], undefined, ''),
    ipv6Address: getValue(device, 'wan.ipv6.address', undefined, ''),
    gateway: getValue(device, 'wan.ip.gateway', undefined, ''),
    dns: getValue(device, 'wan.ip.dns', undefined, ''),
    uptime: getValueMulti(device, ['wan.ppp.uptime', 'device.uptime'], undefined, 0),
    rxBytes: getValue(device, 'wan.stats.rx_bytes', undefined, 0),
    txBytes: getValue(device, 'wan.stats.tx_bytes', undefined, 0),
  };
}

/**
 * Obtém parâmetros de diagnóstico Ping normalizados
 */
export function getPingDiagParams(device: any) {
  return {
    host: getValue(device, 'diag.ping.host', undefined, ''),
    state: getValue(device, 'diag.ping.state', undefined, ''),
    successCount: getValue(device, 'diag.ping.success_count', undefined, 0),
    failureCount: getValue(device, 'diag.ping.failure_count', undefined, 0),
    avgTime: getValue(device, 'diag.ping.avg_time', undefined, 0),
    minTime: getValue(device, 'diag.ping.min_time', undefined, 0),
    maxTime: getValue(device, 'diag.ping.max_time', undefined, 0),
  };
}

// =============================================================================
// EXPORT DEFAULT
// =============================================================================
const TR069Normalizer = {
  // Core
  detectDataModel,
  getPath,
  getPaths,
  getValue,
  getValueByPath,
  getValueMulti,
  buildSetParams,
  inferXsdType,
  hasParameter,
  getDataModelInfo,
  
  // Helpers específicos
  getWifiParams,
  getLanParams,
  getWanParams,
  getPingDiagParams,
  
  // Constantes
  PARAM_MAP,
  MANUFACTURER_MODEL_MAP,
};

export default TR069Normalizer;
