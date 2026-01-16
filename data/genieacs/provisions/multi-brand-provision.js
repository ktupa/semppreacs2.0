/**
 * GenieACS Provision Script - Multi-Brand/Multi-Model
 * 
 * Provision universal que detecta automaticamente o tipo de dispositivo
 * e coleta os parâmetros corretos
 * 
 * Suporta:
 * - TR-098 (InternetGatewayDevice.) - TP-Link, ZTE, Huawei, D-Link antigos
 * - TR-181 (Device.) - Zyxel, TP-Link novos, outros modernos
 */

const now = Date.now();

// === Detectar modelo de dados ===
const deviceInfo181 = declare("Device.DeviceInfo.Manufacturer", {value: now});
const deviceInfo098 = declare("InternetGatewayDevice.DeviceInfo.Manufacturer", {value: now});

const manufacturer181 = deviceInfo181.value ? deviceInfo181.value[0] : null;
const manufacturer098 = deviceInfo098.value ? deviceInfo098.value[0] : null;

const isTR181 = !!manufacturer181;
const isTR098 = !!manufacturer098;

log("Multi-Brand Provision - Manufacturer TR-181: " + manufacturer181 + ", TR-098: " + manufacturer098);

// === TR-181 (Device.*) ===
if (isTR181) {
  // Device Info
  declare("Device.DeviceInfo.ModelName", {value: now});
  declare("Device.DeviceInfo.SerialNumber", {value: now});
  declare("Device.DeviceInfo.HardwareVersion", {value: now});
  declare("Device.DeviceInfo.SoftwareVersion", {value: now});
  declare("Device.DeviceInfo.UpTime", {value: now});
  declare("Device.DeviceInfo.MemoryStatus.Total", {value: now});
  declare("Device.DeviceInfo.MemoryStatus.Free", {value: now});
  declare("Device.DeviceInfo.ProcessStatus.CPUUsage", {value: now});
  
  // WAN/PPP - Interfaces 1 e 2 (Zyxel usa 2)
  declare("Device.PPP.Interface.1.Status", {value: now});
  declare("Device.PPP.Interface.1.Username", {value: now});
  declare("Device.PPP.Interface.1.IPCP.LocalIPAddress", {value: now});
  declare("Device.PPP.Interface.1.IPCP.RemoteIPAddress", {value: now});
  declare("Device.PPP.Interface.2.Status", {value: now});
  declare("Device.PPP.Interface.2.Username", {value: now});
  declare("Device.PPP.Interface.2.IPCP.LocalIPAddress", {value: now});
  declare("Device.PPP.Interface.2.IPCP.RemoteIPAddress", {value: now});
  
  // IP Interfaces (3 = WAN em alguns modelos)
  declare("Device.IP.Interface.1.IPv4Address.1.IPAddress", {value: now});
  declare("Device.IP.Interface.1.Status", {value: now});
  declare("Device.IP.Interface.3.IPv4Address.1.IPAddress", {value: now});
  declare("Device.IP.Interface.3.Status", {value: now});
  declare("Device.IP.Interface.3.Stats.BytesReceived", {value: now});
  declare("Device.IP.Interface.3.Stats.BytesSent", {value: now});
  
  // WiFi - Radios
  declare("Device.WiFi.Radio.1.Enable", {value: now});
  declare("Device.WiFi.Radio.1.Channel", {value: now});
  declare("Device.WiFi.Radio.1.OperatingChannelBandwidth", {value: now});
  declare("Device.WiFi.Radio.1.OperatingStandards", {value: now});
  declare("Device.WiFi.Radio.2.Enable", {value: now});
  declare("Device.WiFi.Radio.2.Channel", {value: now});
  declare("Device.WiFi.Radio.2.OperatingChannelBandwidth", {value: now});
  declare("Device.WiFi.Radio.2.OperatingStandards", {value: now});
  declare("Device.WiFi.Radio.3.Enable", {value: now});
  declare("Device.WiFi.Radio.3.Channel", {value: now});
  
  // WiFi - SSIDs
  declare("Device.WiFi.SSID.1.SSID", {value: now});
  declare("Device.WiFi.SSID.1.Enable", {value: now});
  declare("Device.WiFi.SSID.2.SSID", {value: now});
  declare("Device.WiFi.SSID.2.Enable", {value: now});
  declare("Device.WiFi.SSID.3.SSID", {value: now});
  declare("Device.WiFi.SSID.3.Enable", {value: now});
  
  // WiFi - Security
  declare("Device.WiFi.AccessPoint.1.Security.ModeEnabled", {value: now});
  declare("Device.WiFi.AccessPoint.1.Security.KeyPassphrase", {value: now});
  declare("Device.WiFi.AccessPoint.1.AssociatedDeviceNumberOfEntries", {value: now});
  declare("Device.WiFi.AccessPoint.2.Security.ModeEnabled", {value: now});
  declare("Device.WiFi.AccessPoint.2.Security.KeyPassphrase", {value: now});
  declare("Device.WiFi.AccessPoint.2.AssociatedDeviceNumberOfEntries", {value: now});
  declare("Device.WiFi.AccessPoint.3.Security.ModeEnabled", {value: now});
  declare("Device.WiFi.AccessPoint.3.Security.KeyPassphrase", {value: now});
  declare("Device.WiFi.AccessPoint.3.AssociatedDeviceNumberOfEntries", {value: now});
  
  // LAN
  declare("Device.IP.Interface.4.IPv4Address.1.IPAddress", {value: now});
  declare("Device.IP.Interface.4.IPv4Address.1.SubnetMask", {value: now});
  
  // DHCP
  declare("Device.DHCPv4.Server.Enable", {value: now});
  declare("Device.DHCPv4.Server.Pool.1.MinAddress", {value: now});
  declare("Device.DHCPv4.Server.Pool.1.MaxAddress", {value: now});
  declare("Device.DHCPv4.Server.Pool.1.LeaseTime", {value: now});
  declare("Device.DHCPv4.Client.1.DNSServers", {value: now});
  
  // Hosts
  declare("Device.Hosts.HostNumberOfEntries", {value: now});
  
  // Ethernet MAC
  declare("Device.Ethernet.Interface.1.MACAddress", {value: now});
  declare("Device.Ethernet.Interface.2.MACAddress", {value: now});
  
  log("TR-181 parameters declared");
}

// === TR-098 (InternetGatewayDevice.*) ===
if (isTR098) {
  // Device Info
  declare("InternetGatewayDevice.DeviceInfo.ModelName", {value: now});
  declare("InternetGatewayDevice.DeviceInfo.SerialNumber", {value: now});
  declare("InternetGatewayDevice.DeviceInfo.HardwareVersion", {value: now});
  declare("InternetGatewayDevice.DeviceInfo.SoftwareVersion", {value: now});
  declare("InternetGatewayDevice.DeviceInfo.UpTime", {value: now});
  declare("InternetGatewayDevice.DeviceInfo.MemoryStatus.Total", {value: now});
  declare("InternetGatewayDevice.DeviceInfo.MemoryStatus.Free", {value: now});
  declare("InternetGatewayDevice.DeviceInfo.ProcessStatus.CPUUsage", {value: now});
  
  // WAN/PPP - Connections 1 e 2 (ZTE usa 2)
  declare("InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.ConnectionStatus", {value: now});
  declare("InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Username", {value: now});
  declare("InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.ExternalIPAddress", {value: now});
  declare("InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.DefaultGateway", {value: now});
  declare("InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.DNSServers", {value: now});
  declare("InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.2.ConnectionStatus", {value: now});
  declare("InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.2.Username", {value: now});
  declare("InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.2.ExternalIPAddress", {value: now});
  
  // WAN IP Connection (D-Link, DHCP WAN)
  declare("InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.ConnectionStatus", {value: now});
  declare("InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.ExternalIPAddress", {value: now});
  
  // Traffic Stats
  declare("InternetGatewayDevice.WANDevice.1.WANCommonInterfaceConfig.TotalBytesReceived", {value: now});
  declare("InternetGatewayDevice.WANDevice.1.WANCommonInterfaceConfig.TotalBytesSent", {value: now});
  
  // WiFi 2.4GHz (índice 1)
  declare("InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.Enable", {value: now});
  declare("InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID", {value: now});
  declare("InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.Channel", {value: now});
  declare("InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.BeaconType", {value: now});
  declare("InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.PreSharedKey.1.PreSharedKey", {value: now});
  declare("InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.TotalAssociations", {value: now});
  
  // WiFi 5GHz (índice 2 ou 5 dependendo do modelo)
  declare("InternetGatewayDevice.LANDevice.1.WLANConfiguration.2.Enable", {value: now});
  declare("InternetGatewayDevice.LANDevice.1.WLANConfiguration.2.SSID", {value: now});
  declare("InternetGatewayDevice.LANDevice.1.WLANConfiguration.2.Channel", {value: now});
  declare("InternetGatewayDevice.LANDevice.1.WLANConfiguration.2.TotalAssociations", {value: now});
  declare("InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.Enable", {value: now});
  declare("InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.SSID", {value: now});
  declare("InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.Channel", {value: now});
  declare("InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.TotalAssociations", {value: now});
  
  // LAN
  declare("InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.IPRouters", {value: now});
  declare("InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.SubnetMask", {value: now});
  declare("InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.DHCPServerEnable", {value: now});
  declare("InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.MinAddress", {value: now});
  declare("InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.MaxAddress", {value: now});
  declare("InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.DNSServers", {value: now});
  
  // Hosts
  declare("InternetGatewayDevice.LANDevice.1.Hosts.HostNumberOfEntries", {value: now});
  
  // MAC
  declare("InternetGatewayDevice.LANDevice.1.LANEthernetInterfaceConfig.1.MACAddress", {value: now});
  
  log("TR-098 parameters declared");
}

log("Multi-Brand provision completed");
