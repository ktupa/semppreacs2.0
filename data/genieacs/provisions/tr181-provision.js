/**
 * GenieACS Provision Script - Suporte TR-181 (Device.)
 * 
 * Este script configura a coleta de parâmetros para dispositivos que usam
 * o modelo de dados TR-181 (Device.) ao invés de TR-098 (InternetGatewayDevice.)
 * 
 * Dispositivos suportados:
 * - Zyxel PX3321-T1, PMG2005-T20B e similares
 * - TP-Link EC220-G5 v3.0 (OUI: 482254 com firmware novo)
 * - Outros dispositivos com TR-181
 * 
 * Para usar: Importe este script no GenieACS UI > Admin > Provisions
 */

// Detecta se é dispositivo TR-181 ou TR-098
const deviceRoot = declare("Device.*", {value: Date.now()});
const igdRoot = declare("InternetGatewayDevice.*", {value: Date.now()});

// Se tem Device.DeviceInfo, é TR-181
const isTR181 = deviceRoot.value && deviceRoot.value.length > 0;
const isTR098 = igdRoot.value && igdRoot.value.length > 0;

log("Device Model Detection - TR-181: " + isTR181 + ", TR-098: " + isTR098);

if (isTR181) {
  // === DEVICE INFO (TR-181) ===
  declare("Device.DeviceInfo.*", {value: Date.now()});
  declare("Device.DeviceInfo.Manufacturer", {value: Date.now()});
  declare("Device.DeviceInfo.ModelName", {value: Date.now()});
  declare("Device.DeviceInfo.SerialNumber", {value: Date.now()});
  declare("Device.DeviceInfo.HardwareVersion", {value: Date.now()});
  declare("Device.DeviceInfo.SoftwareVersion", {value: Date.now()});
  declare("Device.DeviceInfo.UpTime", {value: Date.now()});
  declare("Device.DeviceInfo.MemoryStatus.*", {value: Date.now()});
  declare("Device.DeviceInfo.ProcessStatus.*", {value: Date.now()});
  
  // === PPP / WAN (TR-181) ===
  // Zyxel usa PPP.Interface.2 para PPPoE
  declare("Device.PPP.*", {value: Date.now()});
  declare("Device.PPP.Interface.1.*", {value: Date.now()});
  declare("Device.PPP.Interface.2.*", {value: Date.now()});
  declare("Device.PPP.Interface.1.IPCP.*", {value: Date.now()});
  declare("Device.PPP.Interface.2.IPCP.*", {value: Date.now()});
  
  // === IP Interfaces (TR-181) ===
  // Interface 3 geralmente é WAN, 4/5 são LAN
  declare("Device.IP.*", {value: Date.now()});
  declare("Device.IP.Interface.1.*", {value: Date.now()});
  declare("Device.IP.Interface.2.*", {value: Date.now()});
  declare("Device.IP.Interface.3.*", {value: Date.now()});
  declare("Device.IP.Interface.4.*", {value: Date.now()});
  declare("Device.IP.Interface.5.*", {value: Date.now()});
  
  // Stats de cada interface
  declare("Device.IP.Interface.1.Stats.*", {value: Date.now()});
  declare("Device.IP.Interface.2.Stats.*", {value: Date.now()});
  declare("Device.IP.Interface.3.Stats.*", {value: Date.now()});
  
  // IPv4 Addresses
  declare("Device.IP.Interface.1.IPv4Address.*", {value: Date.now()});
  declare("Device.IP.Interface.3.IPv4Address.*", {value: Date.now()});
  declare("Device.IP.Interface.4.IPv4Address.*", {value: Date.now()});
  
  // === WiFi (TR-181) ===
  declare("Device.WiFi.*", {value: Date.now()});
  
  // Radios (1=2.4GHz, 2 ou 3=5GHz dependendo do modelo)
  declare("Device.WiFi.Radio.1.*", {value: Date.now()});
  declare("Device.WiFi.Radio.2.*", {value: Date.now()});
  declare("Device.WiFi.Radio.3.*", {value: Date.now()});
  
  // SSIDs (1=2.4GHz principal, 2/3=5GHz, outros=guest)
  declare("Device.WiFi.SSID.1.*", {value: Date.now()});
  declare("Device.WiFi.SSID.2.*", {value: Date.now()});
  declare("Device.WiFi.SSID.3.*", {value: Date.now()});
  declare("Device.WiFi.SSID.4.*", {value: Date.now()});
  declare("Device.WiFi.SSID.5.*", {value: Date.now()});
  
  // Access Points e Security
  declare("Device.WiFi.AccessPoint.1.*", {value: Date.now()});
  declare("Device.WiFi.AccessPoint.1.Security.*", {value: Date.now()});
  declare("Device.WiFi.AccessPoint.2.*", {value: Date.now()});
  declare("Device.WiFi.AccessPoint.2.Security.*", {value: Date.now()});
  declare("Device.WiFi.AccessPoint.3.*", {value: Date.now()});
  declare("Device.WiFi.AccessPoint.3.Security.*", {value: Date.now()});
  declare("Device.WiFi.AccessPoint.4.*", {value: Date.now()});
  declare("Device.WiFi.AccessPoint.4.Security.*", {value: Date.now()});
  
  // Associated Devices (clientes WiFi)
  declare("Device.WiFi.AccessPoint.1.AssociatedDevice.*", {value: Date.now()});
  declare("Device.WiFi.AccessPoint.2.AssociatedDevice.*", {value: Date.now()});
  declare("Device.WiFi.AccessPoint.3.AssociatedDevice.*", {value: Date.now()});
  
  // === Ethernet (TR-181) ===
  declare("Device.Ethernet.*", {value: Date.now()});
  declare("Device.Ethernet.Interface.1.*", {value: Date.now()});
  declare("Device.Ethernet.Interface.2.*", {value: Date.now()});
  declare("Device.Ethernet.Interface.3.*", {value: Date.now()});
  declare("Device.Ethernet.Interface.4.*", {value: Date.now()});
  declare("Device.Ethernet.Interface.5.*", {value: Date.now()});
  
  // Stats Ethernet
  declare("Device.Ethernet.Interface.1.Stats.*", {value: Date.now()});
  declare("Device.Ethernet.Interface.2.Stats.*", {value: Date.now()});
  
  // === DHCP Server (TR-181) ===
  declare("Device.DHCPv4.*", {value: Date.now()});
  declare("Device.DHCPv4.Server.*", {value: Date.now()});
  declare("Device.DHCPv4.Server.Pool.1.*", {value: Date.now()});
  declare("Device.DHCPv4.Client.1.*", {value: Date.now()});
  
  // === Hosts / LAN Devices (TR-181) ===
  declare("Device.Hosts.*", {value: Date.now()});
  declare("Device.Hosts.Host.*", {value: Date.now()});
  
  // === NAT (TR-181) ===
  declare("Device.NAT.*", {value: Date.now()});
  declare("Device.NAT.InterfaceSetting.*", {value: Date.now()});
  declare("Device.NAT.PortMapping.*", {value: Date.now()});
  
  // === DNS (TR-181) ===
  declare("Device.DNS.*", {value: Date.now()});
  declare("Device.DNS.Client.*", {value: Date.now()});
  
  // === PON/GPON/Optical (TR-181) ===
  declare("Device.Optical.*", {value: Date.now()});
  declare("Device.Optical.Interface.1.*", {value: Date.now()});
  declare("Device.Optical.Interface.1.Stats.*", {value: Date.now()});
  
  // === Vendor Extensions Zyxel ===
  declare("Device.X_ZYXEL_*", {value: Date.now()});
  
  log("TR-181 provision completed for device");
}

// Se também tem TR-098 (dispositivo dual-model ou legado)
if (isTR098 && !isTR181) {
  // Provisionar também TR-098 para fallback
  declare("InternetGatewayDevice.DeviceInfo.*", {value: Date.now()});
  declare("InternetGatewayDevice.WANDevice.*", {value: Date.now()});
  declare("InternetGatewayDevice.LANDevice.*", {value: Date.now()});
  
  log("TR-098 provision completed for device");
}
