import React, { useMemo } from "react";
import {
  Box,
  Text,
  Badge,
  HStack,
  VStack,
  SimpleGrid,
  Table,
  Thead,
  Tr,
  Th,
  Tbody,
  Td,
  Tooltip,
  Icon,
  Divider,
  useColorModeValue,
} from "@chakra-ui/react";
import { FiWifi, FiCpu, FiHardDrive, FiSmartphone, FiMonitor } from "react-icons/fi";

/**
 * HostsTopology.tsx — Mostra clientes Wi‑Fi/LAN e um "mini-mapa" topológico simples
 *
 * Props
 *  - device: objeto retornado do GenieACS (/devices/:id)
 *  - title?: título da seção
 *
 * Como usa:
 *   <HostsTopology device={device} />
 */

export interface HostsTopologyProps {
  device: any;
  title?: string;
}

// ------------------------------
// Utils
// ------------------------------
const get = (o: any, path: string, fb?: any): any => {
  try {
    const v = path.split(".").reduce((acc: any, k: string) => acc?.[k], o);
    if (v === undefined || v === null) return fb;
    if (typeof v === 'object' && '_value' in v) return v._value ?? fb;
    if (typeof v === 'object') return v;
    return v ?? fb;
  } catch {
    return fb;
  }
};

const toArray = (obj: any): any[] => {
  if (!obj) return [];
  if (Array.isArray(obj)) return obj;
  if (typeof obj === "object") return Object.keys(obj).map((k) => obj[k]);
  return [];
};

// TR-098 e TR-181 caminhos possíveis (cobrimos os dois quando der)
const WIFI_ASSOC_PATHS = (radio: number) => [
  `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${radio}.AssociatedDevice`, // TR-098
  `Device.WiFi.AccessPoint.${radio}.AssociatedDevice`, // TR-181
  `Device.WiFi.SSID.${radio}.AssociatedDevice`, // TR-181 alternativo
  `Device.WiFi.AccessPoint.${radio + 2}.AssociatedDevice`, // TR-181 Zyxel (radio 1 -> AP 3, radio 2 -> AP 4)
];

// LAN Hosts (tabela ARP/DHCP do CPE)
const HOSTS_TABLE_PATHS = [
  "InternetGatewayDevice.LANDevice.1.Hosts.Host", // TR-098
  "Device.Hosts.Host", // TR-181
  "Device.DHCPv4.Server.Pool.1.Client", // TR-181 Zyxel
];

// Ethernet status
const ETH_IF_PATHS = [
  "InternetGatewayDevice.LANDevice.1.EthernetInterfaceConfig", // TR-098 (alguns vendors)
  "Device.Ethernet.Interface", // TR-181
  "Device.Ethernet.Link", // TR-181 Zyxel
];

// ------------------------------
// Parsing helpers
// ------------------------------
function parseWifiClients(device: any) {
  const radios = [1, 2];
  const out: Array<{ mac: string; ip?: string; hostname?: string; rssi?: number; band?: "2.4GHz" | "5GHz" }> = [];
  for (const r of radios) {
    for (const base of WIFI_ASSOC_PATHS(r)) {
      const assoc = get(device, base);
      const rows = toArray(assoc);
      for (const row of rows) {
        const mac = get(row, "AssociatedDeviceMACAddress") || get(row, "MACAddress");
        const rssi = Number.parseInt(get(row, "AssociatedDeviceSignalStrength", get(row, "SignalStrength")), 10);
        const ip = get(row, "AssociatedDeviceIPAddress") || get(row, "IPAddress");
        const host = get(row, "AssociatedDeviceHostname") || get(row, "HostName");
        if (mac) {
          out.push({ mac, ip, hostname: host, rssi: Number.isFinite(rssi) ? rssi : undefined, band: r === 1 ? "2.4GHz" : "5GHz" });
        }
      }
    }
  }
  return out;
}

function parseLanHosts(device: any) {
  for (const base of HOSTS_TABLE_PATHS) {
    const table = get(device, base);
    const rows = toArray(table);
    if (rows.length) {
      return rows.map((row: any) => {
        const ip = get(row, "IPAddress");
        const mac = get(row, "MACAddress");
        const hn = get(row, "HostName") || get(row, "X_TP_HostName") || get(row, "Name");
        const active = String(get(row, "Active", "false")) === "true";
        return { ip, mac, hostname: hn, active };
      });
    }
  }
  return [] as Array<{ ip?: string; mac?: string; hostname?: string; active?: boolean }>;
}

function parseEthernetPorts(device: any) {
  for (const base of ETH_IF_PATHS) {
    const table = get(device, base);
    const rows = toArray(table);
    if (rows.length) {
      // Normaliza em ordem por IfIndex/Name quando disponível
      return rows
        .map((row: any) => ({
          name: get(row, "Name") || get(row, "X_TP_IfName") || "LAN",
          up: (get(row, "Status") || get(row, "Upstream") || "Down") === "Up",
          speed: get(row, "MaxBitRate") || get(row, "MaxBitRateDown"),
        }))
        .sort((a, b) => String(a.name).localeCompare(String(b.name)));
    }
  }
  return [] as Array<{ name: string; up: boolean; speed?: string }>;
}

// Badge de sinal
function rssiBadge(rssi?: number) {
  if (rssi === undefined || !Number.isFinite(rssi)) return <Badge colorScheme="gray">—</Badge>;
  const color = rssi >= -55 ? "green" : rssi >= -67 ? "teal" : rssi >= -75 ? "yellow" : rssi >= -85 ? "orange" : "red";
  const label = rssi >= -55 ? "Excelente" : rssi >= -67 ? "Bom" : rssi >= -75 ? "Médio" : rssi >= -85 ? "Ruim" : "Muito ruim";
  return <Badge colorScheme={color}>{label} ({rssi} dBm)</Badge>;
}

// ------------------------------
// Component
// ------------------------------
export default function HostsTopology({ device, title = "Dispositivos Wireless & Qualidade" }: HostsTopologyProps) {
  const wifi = useMemo(() => parseWifiClients(device), [device]);
  const lan = useMemo(() => parseLanHosts(device), [device]);
  const ports = useMemo(() => parseEthernetPorts(device), [device]);

  const cardBg = useColorModeValue("gray.900", "gray.900");
  const head = useColorModeValue("gray.800", "gray.800");
  const textSoft = useColorModeValue("gray.300", "gray.300");

  return (
    <VStack align="stretch" spacing={4}>
      {/* TOP: Wi‑Fi Clients card */}
      <Box bg={cardBg} p={4} borderRadius="md">
        <HStack mb={2} spacing={3}>
          <Icon as={FiWifi} />
          <Text fontWeight="bold">{title}</Text>
          <Badge colorScheme="purple">{wifi.length}</Badge>
        </HStack>
        {wifi.length ? (
          <Box overflowX="auto">
            <Table size="sm" variant="simple" minW="800px">
              <Thead>
                <Tr bg={head}>
                  <Th color="gray.200">MAC</Th>
                  <Th color="gray.200">Banda</Th>
                  <Th color="gray.200">Sinal</Th>
                  <Th color="gray.200">Hostname</Th>
                  <Th color="gray.200">IP</Th>
                </Tr>
              </Thead>
              <Tbody>
                {wifi.map((c) => (
                  <Tr key={c.mac}>
                    <Td><CodeMono>{c.mac}</CodeMono></Td>
                    <Td><Badge>{c.band}</Badge></Td>
                    <Td>{rssiBadge(c.rssi)}</Td>
                    <Td><Text color="white">{c.hostname || "—"}</Text></Td>
                    <Td><Text color="white">{c.ip || "—"}</Text></Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </Box>
        ) : (
          <Text fontSize="sm" color={textSoft}>Sem hosts conectados no momento. Quando houver, aparecem aqui com sinal e banda.</Text>
        )}
      </Box>

      {/* MIDDLE: LAN Ports + TX/RX placeholder */}
      <SimpleGrid columns={{ base: 1, md: 2 }} gap={4}>
        <Box bg={cardBg} p={4} borderRadius="md">
          <Text fontWeight="bold" mb={3}>Portas físicas</Text>
          <HStack spacing={3} wrap="wrap">
            {ports.length ? (
              ports.map((p, i) => (
                <Tooltip key={i} label={`${p.name} • ${p.up ? "UP" : "DOWN"}${p.speed ? ` • ${p.speed}` : ""}`}>
                  <Box
                    borderWidth="2px"
                    borderColor={p.up ? "teal.400" : "gray.600"}
                    bg={p.up ? "teal.700" : "gray.700"}
                    color="white"
                    px={3}
                    py={2}
                    borderRadius="md"
                    display="flex"
                    alignItems="center"
                    gap={2}
                  >
                    <Icon as={FiHardDrive} />
                    <Text>{p.name}</Text>
                  </Box>
                </Tooltip>
              ))
            ) : (
              <Text fontSize="sm" color={textSoft}>Sem leitura de portas LAN expostas pelo CPE.</Text>
            )}
          </HStack>
        </Box>
        <Box bg={cardBg} p={4} borderRadius="md">
          <Text fontWeight="bold" mb={3}>Leituras de TX/RX</Text>
          <Box
            borderWidth="1px"
            borderColor="whiteAlpha.200"
            borderRadius="md"
            minH="140px"
            display="flex"
            alignItems="center"
            justifyContent="center"
          >
            <Text fontSize="sm" color={textSoft}>Não há leituras de TX/RX</Text>
          </Box>
        </Box>
      </SimpleGrid>

      {/* BOTTOM: Topologia simples */}
      <Box bg={cardBg} p={4} borderRadius="md">
        <Text fontWeight="bold" mb={2}>Topologia (visão rápida)</Text>
        <TopologyBar wifi={wifi} lan={lan} />
        <Divider my={4} />
        <Text fontSize="sm" color={textSoft}>
          * Esta é uma visão simplificada baseada nos parâmetros Hosts/AssociatedDevice. Para uma topologia completa, podemos
          evoluir para um grafo interativo (vis-network) quando desejar.
        </Text>
      </Box>
    </VStack>
  );
}

// ------------------------------
// Subcomponentes
// ------------------------------
function CodeMono({ children }: { children: React.ReactNode }) {
  return (
    <Box as="code" fontFamily="mono" px={2} py={0.5} bg="blackAlpha.600" borderRadius="md">
      {children}
    </Box>
  );
}

function Node({ icon, label, sub }: { icon: any; label: string; sub?: string }) {
  return (
    <VStack spacing={1} minW="120px">
      <Box bg="gray.700" borderWidth="1px" borderColor="whiteAlpha.200" px={3} py={2} borderRadius="md">
        <HStack>
          <Icon as={icon} />
          <Text color="white" fontWeight="semibold">{label}</Text>
        </HStack>
      </Box>
      {sub ? <Text fontSize="xs" color="gray.300">{sub}</Text> : null}
    </VStack>
  );
}

function Line() {
  return <Box flex={1} h="2px" bg="whiteAlpha.400" />;
}

function TopologyBar({
  wifi,
  lan,
}: {
  wifi: Array<{ mac: string; ip?: string; hostname?: string; rssi?: number; band?: "2.4GHz" | "5GHz" }>;
  lan: Array<{ ip?: string; mac?: string; hostname?: string; active?: boolean }>;
}) {
  // Agrupa LAN hosts ativos
  const activos = lan.filter((h) => h.active);

  return (
    <VStack align="stretch" spacing={4}>
      {/* Barra principal */}
      <HStack align="center">
        <Node icon={FiCpu} label="CPE" sub="Router/AP" />
        <Line />
        <Node icon={FiMonitor} label={`LAN (${activos.length})`} sub="Dispositivos ativos" />
        <Line />
        <Node icon={FiWifi} label={`Wi‑Fi (${wifi.length})`} sub="Clientes associados" />
      </HStack>

      {/* Listas compactas */}
      <SimpleGrid columns={{ base: 1, md: 2 }} gap={4}>
        <Box>
          <Text fontWeight="semibold" mb={2}>LAN ativos</Text>
          {activos.length ? (
            <HStack spacing={2} wrap="wrap">
              {activos.map((h, i) => (
                <Tooltip key={i} label={`${h.hostname || "—"} • ${h.ip || "—"}`}>
                  <Badge colorScheme="cyan">
                    <HStack>
                      <Icon as={FiSmartphone} />
                      <Text>{h.hostname || h.ip || h.mac || "host"}</Text>
                    </HStack>
                  </Badge>
                </Tooltip>
              ))}
            </HStack>
          ) : (
            <Text fontSize="sm" color="gray.400">Nenhum host ativo reportado.</Text>
          )}
        </Box>
        <Box>
          <Text fontWeight="semibold" mb={2}>Wi‑Fi clientes</Text>
          {wifi.length ? (
            <HStack spacing={2} wrap="wrap">
              {wifi.map((c) => (
                <Tooltip key={c.mac} label={`${c.hostname || "—"} • ${c.ip || "—"}`}>
                  <Badge colorScheme="purple">
                    <HStack>
                      <Icon as={FiWifi} />
                      <Text>{c.hostname || c.mac}</Text>
                    </HStack>
                  </Badge>
                </Tooltip>
              ))}
            </HStack>
          ) : (
            <Text fontSize="sm" color="gray.400">Sem clientes associados.</Text>
          )}
        </Box>
      </SimpleGrid>
    </VStack>
  );
}
