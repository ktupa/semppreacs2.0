// src/components/WifiTopology.tsx
import {
  Box,
  Text,
  VStack,
  HStack,
  Badge,
  Icon,
  Tooltip,
  Collapse,
  IconButton,
  SimpleGrid,
  Stat,
  StatLabel,
  StatNumber,
  Code,
  Divider,
} from "@chakra-ui/react";
import { useMemo, useState } from "react";
import {
  FaWifi,
  FaSignal,
  FaMobileAlt,
  FaLaptop,
  FaDesktop,
  FaTabletAlt,
  FaTv,
  FaGamepad,
  FaChevronDown,
  FaChevronRight,
} from "react-icons/fa";
import { MdRouter, MdDevicesOther } from "react-icons/md";

interface Props {
  device: any;
}

interface WifiClient {
  mac: string;
  ip?: string;
  hostname?: string;
  rssi?: number;
  txRate?: number;
  rxRate?: number;
  band: "2.4GHz" | "5GHz";
  ssid?: string;
  uptime?: number;
  vendorId?: string;
}

interface RadioInfo {
  band: "2.4GHz" | "5GHz";
  enabled: boolean;
  ssid: string;
  channel: number | string;
  bandwidth: string;
  security: string;
  txPower: number;
  clients: WifiClient[];
  clientCount: number;
}

// Helpers - garante extração correta de valores TR-069
const get = (o: any, path: string, fb?: any): any => {
  try {
    const v = path.split(".").reduce((acc: any, k: string) => acc?.[k], o);
    if (v === undefined || v === null) return fb;
    
    // Se for objeto com _value, extrair o valor
    if (typeof v === 'object' && '_value' in v) {
      return v._value ?? fb;
    }
    
    // Se for objeto sem _value, pode ser um container - retornar o objeto inteiro
    if (typeof v === 'object') {
      return v;
    }
    
    return v ?? fb;
  } catch {
    return fb;
  }
};

// Identificar dispositivo pelo hostname/vendor
const getDeviceIcon = (client: WifiClient) => {
  const name = ((client.hostname || "") + (client.vendorId || "")).toLowerCase();
  if (name.includes("iphone") || name.includes("android") || name.includes("samsung") || name.includes("xiaomi") || name.includes("pixel")) {
    return FaMobileAlt;
  }
  if (name.includes("macbook") || name.includes("laptop") || name.includes("notebook")) {
    return FaLaptop;
  }
  if (name.includes("ipad") || name.includes("tablet")) {
    return FaTabletAlt;
  }
  if (name.includes("tv") || name.includes("roku") || name.includes("chromecast") || name.includes("fire")) {
    return FaTv;
  }
  if (name.includes("playstation") || name.includes("xbox") || name.includes("nintendo")) {
    return FaGamepad;
  }
  if (name.includes("desktop") || name.includes("pc-") || name.includes("windows")) {
    return FaDesktop;
  }
  return MdDevicesOther;
};

// Cor do sinal
const getSignalColor = (rssi?: number) => {
  if (!rssi) return "gray";
  if (rssi >= -50) return "green";
  if (rssi >= -60) return "teal";
  if (rssi >= -70) return "yellow";
  if (rssi >= -80) return "orange";
  return "red";
};

const getSignalLabel = (rssi?: number) => {
  if (!rssi) return "Desconhecido";
  if (rssi >= -50) return "Excelente";
  if (rssi >= -60) return "Muito Bom";
  if (rssi >= -70) return "Bom";
  if (rssi >= -80) return "Regular";
  return "Fraco";
};

// Vendor por OUI
const getVendor = (mac: string): string => {
  const oui = mac.toUpperCase().replace(/[:-]/g, "").substring(0, 6);
  const vendors: Record<string, string> = {
    "D8778B": "Intelbras",
    "E848B8": "TP-Link",
    "1C61B4": "TP-Link",
    "5CA6E6": "TP-Link",
    "00E0FC": "Huawei",
    "001E10": "Apple",
    "F0B429": "Samsung",
    "B4A7C6": "Amazon",
    "9C5C8E": "Apple",
    "3C7C3F": "Apple",
    "DC2C26": "Apple",
    "A4C3F0": "Intel",
    "FC1C74": "Samsung",
    "74DA38": "LG",
    "B827EB": "Raspberry Pi",
    "DC4493": "Xiaomi",
  };
  return vendors[oui] || "";
};

export default function WifiTopology({ device }: Props) {
  const [expandedBands, setExpandedBands] = useState<Record<string, boolean>>({
    "2.4GHz": true,
    "5GHz": true,
  });

  // Extrair informações dos rádios
  const radios = useMemo<RadioInfo[]>(() => {
    const result: RadioInfo[] = [];
    
    // TR-098 paths
    const wl1 = get(device, "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1", {});
    const wl2 = get(device, "InternetGatewayDevice.LANDevice.1.WLANConfiguration.2", {});
    const wl5 = get(device, "InternetGatewayDevice.LANDevice.1.WLANConfiguration.5", {}); // ZTE/Huawei 5GHz
    
    // TR-181 fallback (Device.WiFi)
    const wl181_1 = get(device, "Device.WiFi.SSID.1", {});
    const wl181_2 = get(device, "Device.WiFi.SSID.2", {});
    const wl181_3 = get(device, "Device.WiFi.SSID.3", {}); // Zyxel 5GHz alternativo
    
    // TR-181 Radio info
    const radio181_1 = get(device, "Device.WiFi.Radio.1", {});
    const radio181_2 = get(device, "Device.WiFi.Radio.2", {});
    const radio181_3 = get(device, "Device.WiFi.Radio.3", {}); // Zyxel
    
    // TR-181 Access Points (para clientes e segurança)
    const ap181_1 = get(device, "Device.WiFi.AccessPoint.1", {});
    const ap181_2 = get(device, "Device.WiFi.AccessPoint.2", {});
    const ap181_3 = get(device, "Device.WiFi.AccessPoint.3", {}); // Zyxel 5GHz
    
    // Determinar qual 5GHz usar (wl2 para TP-Link, wl5 para ZTE/Huawei)
    const wl5ghz_098 = Object.keys(wl2).length ? wl2 : wl5;
    
    // Determinar qual TR-181 usar para 5GHz
    const wl5ghz_181 = Object.keys(wl181_2).length ? wl181_2 : wl181_3;
    const radio5ghz_181 = Object.keys(radio181_2).length ? radio181_2 : radio181_3;
    const ap5ghz_181 = Object.keys(ap181_2).length ? ap181_2 : ap181_3;
    
    const configs = [
      { 
        raw: Object.keys(wl1).length ? wl1 : wl181_1, 
        radio: radio181_1,
        ap: ap181_1,
        band: "2.4GHz" as const, 
        idx: 1 
      },
      { 
        raw: Object.keys(wl5ghz_098).length ? wl5ghz_098 : wl5ghz_181, 
        radio: radio5ghz_181,
        ap: ap5ghz_181,
        band: "5GHz" as const, 
        idx: 2 
      },
    ];
    
    for (const cfg of configs) {
      if (!cfg.raw || !Object.keys(cfg.raw).length) continue;
      
      // Verificar enable em múltiplos lugares (TR-098 e TR-181)
      const enableVal = get(cfg.raw, "Enable") ?? get(cfg.radio, "Enable");
      const enabled = enableVal === true || enableVal === "1" || enableVal === 1;
      
      // SSID pode vir do SSID ou do radio config
      const ssid = get(cfg.raw, "SSID", "") || get(cfg.radio, "SSID", "");
      
      // Channel - pode vir do raw (TR-098) ou do radio (TR-181)
      const channel = get(cfg.raw, "Channel") || get(cfg.radio, "Channel", "Auto");
      
      // Bandwidth - TR-098 específicos ou TR-181 padrão
      const bandwidth = get(cfg.raw, "X_TP_Bandwidth") || 
                       get(cfg.raw, "OperatingChannelBandwidth") ||
                       get(cfg.radio, "OperatingChannelBandwidth") ||
                       get(cfg.radio, "CurrentOperatingChannelBandwidth", "Auto");
      
      // Security - TR-098 ou TR-181 AccessPoint
      const security = get(cfg.raw, "BeaconType") || 
                      get(cfg.raw, "X_TP_SecurityMode") ||
                      get(cfg.ap, "Security.ModeEnabled", "WPA2");
      
      // TX Power
      const txPower = Number(get(cfg.raw, "X_TP_TransmitPower") || 
                            get(cfg.raw, "TransmitPower") ||
                            get(cfg.radio, "TransmitPower", 100));
      
      // Clientes associados - TR-098 (cfg.raw) ou TR-181 (cfg.ap)
      const assocDevices = get(cfg.raw, "AssociatedDevice") || get(cfg.ap, "AssociatedDevice", {});
      const clients: WifiClient[] = [];
      
      if (assocDevices && typeof assocDevices === "object") {
        for (const [key, clientData] of Object.entries(assocDevices)) {
          // Ignorar campos de metadados (_object, _writable, etc.)
          if (key.startsWith("_")) continue;
          
          const c = clientData as any;
          // MAC address - padrão TR-098 ou variantes
          const mac = get(c, "AssociatedDeviceMACAddress", "");
          if (!mac) continue;
          
          // Hostname - padrão ou TP-Link específico
          const hostname = get(c, "AssociatedDeviceHostname", "") ||
                          get(c, "X_TP_StaHostName", "") ||
                          get(c, "HostName", "");
          
          // Signal strength - padrão ou TP-Link específico
          const rssiStr = get(c, "AssociatedDeviceSignalStrength", "") ||
                         get(c, "X_TP_StaSignalStrength", "") ||
                         get(c, "SignalStrength", "");
          const rssi = rssiStr ? parseInt(rssiStr, 10) : undefined;
          
          // TX/RX rates - TP-Link específico
          const txRate = Number(get(c, "X_TP_TxRate", 0)) ||
                        Number(get(c, "AssociatedDeviceTxDataRate", 0)) || undefined;
          const rxRate = Number(get(c, "X_TP_RxRate", 0)) ||
                        Number(get(c, "AssociatedDeviceRxDataRate", 0)) || undefined;
          
          // Connection speed (TP-Link)
          const connSpeed = Number(get(c, "X_TP_StaConnectionSpeed", 0)) || undefined;
          
          clients.push({
            mac,
            ip: get(c, "AssociatedDeviceIPAddress", ""),
            hostname: hostname || undefined,
            rssi,
            txRate: txRate || connSpeed,
            rxRate,
            band: cfg.band,
            ssid,
            vendorId: getVendor(mac),
          });
        }
      }
      
      // Total de associações (fallback)
      const totalAssoc = Number(get(cfg.raw, "TotalAssociations", clients.length));
      
      result.push({
        band: cfg.band,
        enabled,
        ssid,
        channel,
        bandwidth,
        security,
        txPower,
        clients,
        clientCount: totalAssoc || clients.length,
      });
    }
    
    return result;
  }, [device]);

  const toggleBand = (band: string) => {
    setExpandedBands(prev => ({ ...prev, [band]: !prev[band] }));
  };

  const totalClients = radios.reduce((sum, r) => sum + r.clientCount, 0);

  return (
    <Box>
      {/* Estatísticas gerais */}
      <SimpleGrid columns={{ base: 2, md: 4 }} spacing={4} mb={6}>
        <Stat bg="gray.700" p={3} borderRadius="lg">
          <StatLabel color="gray.400" fontSize="xs">Total Clientes</StatLabel>
          <StatNumber color="white" fontSize="xl">{totalClients}</StatNumber>
        </Stat>
        <Stat bg="gray.700" p={3} borderRadius="lg">
          <StatLabel color="gray.400" fontSize="xs">2.4GHz</StatLabel>
          <StatNumber color="cyan.400" fontSize="xl">
            {radios.find(r => r.band === "2.4GHz")?.clientCount || 0}
          </StatNumber>
        </Stat>
        <Stat bg="gray.700" p={3} borderRadius="lg">
          <StatLabel color="gray.400" fontSize="xs">5GHz</StatLabel>
          <StatNumber color="purple.400" fontSize="xl">
            {radios.find(r => r.band === "5GHz")?.clientCount || 0}
          </StatNumber>
        </Stat>
        <Stat bg="gray.700" p={3} borderRadius="lg">
          <StatLabel color="gray.400" fontSize="xs">Rádios Ativos</StatLabel>
          <StatNumber color="green.400" fontSize="xl">
            {radios.filter(r => r.enabled).length}
          </StatNumber>
        </Stat>
      </SimpleGrid>

      {/* Árvore de topologia */}
      <Box bg="gray.800" p={4} borderRadius="xl" border="1px solid" borderColor="gray.700">
        {/* Raiz: Router */}
        <HStack spacing={3} mb={4}>
          <Box bg="blue.600" p={3} borderRadius="full">
            <Icon as={MdRouter} boxSize={6} color="white" />
          </Box>
          <VStack align="start" spacing={0}>
            <Text fontWeight="bold" color="white">
              {device?._deviceId?._ProductClass || "Router"}
            </Text>
            <Text fontSize="xs" color="gray.400">
              {device?._deviceId?._Manufacturer || ""}
            </Text>
          </VStack>
          <Badge colorScheme="green" ml="auto">Online</Badge>
        </HStack>

        <Divider borderColor="gray.600" mb={4} />

        {/* Rádios WiFi */}
        <VStack align="stretch" spacing={4} pl={6}>
          {radios.map((radio) => (
            <Box key={radio.band}>
              {/* Header do rádio */}
              <HStack
                spacing={3}
                cursor="pointer"
                onClick={() => toggleBand(radio.band)}
                _hover={{ bg: "whiteAlpha.100" }}
                p={2}
                borderRadius="md"
              >
                <Box
                  w="2px"
                  h="40px"
                  bg={radio.band === "2.4GHz" ? "cyan.500" : "purple.500"}
                />
                <IconButton
                  aria-label="Expandir"
                  icon={expandedBands[radio.band] ? <FaChevronDown /> : <FaChevronRight />}
                  size="xs"
                  variant="ghost"
                />
                <Box
                  bg={radio.band === "2.4GHz" ? "cyan.600" : "purple.600"}
                  p={2}
                  borderRadius="lg"
                >
                  <Icon as={FaWifi} color="white" />
                </Box>
                <VStack align="start" spacing={0} flex={1}>
                  <HStack>
                    <Text fontWeight="bold" color="white">{radio.band}</Text>
                    <Badge colorScheme={radio.enabled ? "green" : "gray"} size="sm">
                      {radio.enabled ? "ON" : "OFF"}
                    </Badge>
                  </HStack>
                  <Text fontSize="xs" color="gray.400">
                    {radio.ssid || "SSID não configurado"} • Canal {radio.channel} • {radio.security}
                  </Text>
                </VStack>
                <Badge colorScheme={radio.band === "2.4GHz" ? "cyan" : "purple"}>
                  {radio.clientCount} clientes
                </Badge>
              </HStack>

              {/* Lista de clientes */}
              <Collapse in={expandedBands[radio.band]}>
                <VStack align="stretch" spacing={2} pl={12} mt={2}>
                  {radio.clients.length > 0 ? (
                    radio.clients.map((client) => {
                      const DeviceIcon = getDeviceIcon(client);
                      const signalColor = getSignalColor(client.rssi);
                      
                      return (
                        <HStack
                          key={client.mac}
                          bg="gray.700"
                          p={3}
                          borderRadius="lg"
                          spacing={3}
                          _hover={{ bg: "gray.650" }}
                        >
                          {/* Linha de conexão */}
                          <Box w="20px" h="2px" bg={radio.band === "2.4GHz" ? "cyan.500" : "purple.500"} />
                          
                          {/* Ícone do dispositivo */}
                          <Box bg="gray.600" p={2} borderRadius="md">
                            <Icon as={DeviceIcon} color="white" />
                          </Box>
                          
                          {/* Info do cliente */}
                          <VStack align="start" spacing={0} flex={1}>
                            <HStack>
                              <Text fontWeight="semibold" color="white" fontSize="sm">
                                {client.hostname || "Dispositivo"}
                              </Text>
                              {client.vendorId && (
                                <Badge colorScheme="gray" size="sm">{client.vendorId}</Badge>
                              )}
                            </HStack>
                            <HStack spacing={2}>
                              <Code fontSize="xs" bg="blackAlpha.400">{client.mac}</Code>
                              {client.ip && (
                                <Text fontSize="xs" color="gray.400">{client.ip}</Text>
                              )}
                            </HStack>
                          </VStack>
                          
                          {/* Sinal */}
                          <Tooltip label={`${getSignalLabel(client.rssi)} (${client.rssi} dBm)`}>
                            <VStack spacing={1}>
                              <Icon as={FaSignal} color={`${signalColor}.400`} />
                              <Text fontSize="xs" color={`${signalColor}.400`}>
                                {client.rssi ? `${client.rssi}dBm` : "—"}
                              </Text>
                            </VStack>
                          </Tooltip>
                          
                          {/* Taxa */}
                          {client.txRate && (
                            <VStack spacing={0}>
                              <Text fontSize="xs" color="gray.400">TX</Text>
                              <Text fontSize="xs" color="white">{client.txRate}Mbps</Text>
                            </VStack>
                          )}
                        </HStack>
                      );
                    })
                  ) : (
                    <Box bg="gray.700" p={4} borderRadius="lg" textAlign="center">
                      <Text color="gray.400" fontSize="sm">
                        {radio.enabled ? "Nenhum cliente conectado" : "Rádio desativado"}
                      </Text>
                    </Box>
                  )}
                </VStack>
              </Collapse>
            </Box>
          ))}
        </VStack>
      </Box>
    </Box>
  );
}
