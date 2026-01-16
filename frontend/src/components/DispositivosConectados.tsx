// src/components/DispositivosConectados.tsx
import {
  Box,
  Text,
  Badge,
  Button,
  SimpleGrid,
  VStack,
  HStack,
  Icon,
  useToast,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Code,
  Input,
  InputGroup,
  InputLeftElement,
  Select,
  Stat,
  StatLabel,
  StatNumber,
  StatGroup,
  Tooltip,
  IconButton,
  Divider,
} from "@chakra-ui/react";
import { useEffect, useState, useMemo } from "react";
import { 
  FaNetworkWired, 
  FaWifi, 
  FaSearch,
  FaDesktop,
  FaMobileAlt,
  FaLaptop,
  FaQuestion,
  FaSignal,
} from "react-icons/fa";
import { RepeatIcon } from "@chakra-ui/icons";
import { createTask } from "../services/genieAcsApi";

interface Props {
  device: any;
}

interface Host {
  hostName: string;
  ip: string;
  mac: string;
  interfaceType: string;
  leaseTime: number;
  active: boolean;
  vendorId: string;
  connInterface: string;
  rssi?: number;
  band?: string;
}

// Identificar tipo de dispositivo pelo vendor/hostname
const getDeviceIcon = (host: Host) => {
  const name = (host.hostName + host.vendorId).toLowerCase();
  if (name.includes("iphone") || name.includes("android") || name.includes("samsung") || name.includes("xiaomi")) {
    return FaMobileAlt;
  }
  if (name.includes("macbook") || name.includes("laptop") || name.includes("notebook")) {
    return FaLaptop;
  }
  if (name.includes("desktop") || name.includes("pc-") || name.includes("windows")) {
    return FaDesktop;
  }
  return FaQuestion;
};

// Identificar fabricante pelo MAC (OUI)
const getVendorByMac = (mac: string): string => {
  const oui = mac.toUpperCase().replace(/[:-]/g, "").substring(0, 6);
  const vendors: Record<string, string> = {
    "D8778B": "Intelbras",
    "E848B8": "TP-Link",
    "1C61B4": "TP-Link",
    "5CA6E6": "TP-Link",
    "3460F9": "TP-Link",
    "00E0FC": "Huawei",
    "001E10": "Apple",
    "F0B429": "Samsung",
    "AC233F": "Shenzhen",
    "B4A7C6": "Amazon",
    "9C5C8E": "Apple",
    "3C7C3F": "Apple",
    "DC2C26": "Apple",
  };
  return vendors[oui] || "";
};

export default function DispositivosConectados({ device }: Props) {
  const toast = useToast();
  const [hosts, setHosts] = useState<Host[]>([]);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!device) return;
    
    // TR-098 path
    const rawHosts = device?.InternetGatewayDevice?.LANDevice?.["1"]?.Hosts?.Host;
    
    // TR-181 path fallback
    const rawHosts181 = device?.Device?.Hosts?.Host;
    
    const hostsData = rawHosts || rawHosts181;
    if (!hostsData) return;

    const lista: Host[] = Object.entries(hostsData).map(([, host]: [string, any]) => {
      const mac = host?.MACAddress?._value || host?.PhysicalAddress?._value || "—";
      return {
        hostName: host?.HostName?._value || "Desconhecido",
        ip: host?.IPAddress?._value || "—",
        mac,
        interfaceType: host?.InterfaceType?._value || host?.Layer1Interface?._value || "—",
        leaseTime: Number(host?.LeaseTimeRemaining?._value) || 0,
        active: host?.Active?._value === "1" || host?.Active?._value === true || host?.Active?._value === "True",
        vendorId: host?.VendorClassID?._value || getVendorByMac(mac),
        connInterface: host?.X_TP_ConnIntf?._value || host?.Layer1Interface?._value || "—",
        rssi: host?.AssociatedDeviceRSSI?._value ? Number(host?.AssociatedDeviceRSSI?._value) : undefined,
        band: host?.X_TP_Band?._value || undefined,
      };
    });

    setHosts(lista);
  }, [device]);

  // Filtrar hosts
  const filteredHosts = useMemo(() => {
    return hosts.filter(h => {
      // Filtro de busca
      const searchLower = search.toLowerCase();
      const matchSearch = !search || 
        h.hostName.toLowerCase().includes(searchLower) ||
        h.ip.includes(searchLower) ||
        h.mac.toLowerCase().includes(searchLower) ||
        h.vendorId.toLowerCase().includes(searchLower);
      
      // Filtro de tipo
      const matchType = filterType === "all" ||
        (filterType === "wifi" && (h.interfaceType === "802.11" || h.interfaceType.includes("WiFi"))) ||
        (filterType === "lan" && (h.interfaceType === "Ethernet" || h.interfaceType.includes("LAN"))) ||
        (filterType === "active" && h.active);
      
      return matchSearch && matchType;
    });
  }, [hosts, search, filterType]);

  // Estatísticas
  const stats = useMemo(() => {
    const total = hosts.length;
    const active = hosts.filter(h => h.active).length;
    const wifi = hosts.filter(h => h.interfaceType === "802.11" || h.interfaceType.includes("WiFi")).length;
    const lan = hosts.filter(h => h.interfaceType === "Ethernet" || h.interfaceType.includes("LAN")).length;
    return { total, active, wifi, lan };
  }, [hosts]);

  const formatSeconds = (seconds: number): string => {
    if (!seconds || isNaN(seconds)) return "—";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  const refreshHosts = async () => {
    if (!device?._id) return;
    setRefreshing(true);
    try {
      await createTask(device._id, {
        name: "getParameterValues",
        parameterNames: ["InternetGatewayDevice.LANDevice.1.Hosts."],
      }, true);
      toast({
        title: "Solicitação enviada",
        description: "Aguarde o dispositivo atualizar os dados",
        status: "info",
        duration: 3000,
      });
    } catch {
      toast({ title: "Erro ao atualizar", status: "error" });
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Box>
      {/* Estatísticas */}
      <StatGroup mb={4}>
        <Stat>
          <StatLabel color="gray.400">Total</StatLabel>
          <StatNumber color="white">{stats.total}</StatNumber>
        </Stat>
        <Stat>
          <StatLabel color="gray.400">Ativos</StatLabel>
          <StatNumber color="green.400">{stats.active}</StatNumber>
        </Stat>
        <Stat>
          <StatLabel color="gray.400">WiFi</StatLabel>
          <StatNumber color="cyan.400">{stats.wifi}</StatNumber>
        </Stat>
        <Stat>
          <StatLabel color="gray.400">LAN</StatLabel>
          <StatNumber color="purple.400">{stats.lan}</StatNumber>
        </Stat>
      </StatGroup>

      <Divider borderColor="gray.600" mb={4} />

      {/* Filtros */}
      <HStack spacing={4} mb={4} flexWrap="wrap">
        <InputGroup maxW="300px">
          <InputLeftElement>
            <Icon as={FaSearch} color="gray.400" />
          </InputLeftElement>
          <Input
            placeholder="Buscar por nome, IP, MAC..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            bg="gray.700"
            border="none"
          />
        </InputGroup>
        
        <Select
          maxW="150px"
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          bg="gray.700"
          border="none"
        >
          <option value="all">Todos</option>
          <option value="active">Ativos</option>
          <option value="wifi">WiFi</option>
          <option value="lan">LAN</option>
        </Select>

        <Button
          size="sm"
          variant={viewMode === "grid" ? "solid" : "outline"}
          onClick={() => setViewMode("grid")}
        >
          Grid
        </Button>
        <Button
          size="sm"
          variant={viewMode === "table" ? "solid" : "outline"}
          onClick={() => setViewMode("table")}
        >
          Tabela
        </Button>

        <Tooltip label="Atualizar lista de hosts">
          <IconButton
            aria-label="Atualizar"
            icon={<RepeatIcon />}
            size="sm"
            onClick={refreshHosts}
            isLoading={refreshing}
          />
        </Tooltip>
      </HStack>

      {/* Lista de Hosts */}
      {viewMode === "grid" ? (
        <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={4}>
          {filteredHosts.map((host, idx) => {
            const DeviceIcon = getDeviceIcon(host);
            const isWifi = host.interfaceType === "802.11" || host.interfaceType.includes("WiFi");
            
            return (
              <Box
                key={idx}
                bg="gray.700"
                p={4}
                borderRadius="lg"
                borderLeft="4px solid"
                borderLeftColor={host.active ? "green.500" : "gray.500"}
              >
                <HStack justify="space-between" mb={3}>
                  <HStack>
                    <Icon
                      as={isWifi ? FaWifi : FaNetworkWired}
                      color={isWifi ? "cyan.400" : "purple.400"}
                    />
                    <Text fontWeight="bold" noOfLines={1} maxW="150px">
                      {host.hostName}
                    </Text>
                  </HStack>
                  <HStack>
                    {host.active && <Badge colorScheme="green">ATIVO</Badge>}
                    <Icon as={DeviceIcon} color="gray.400" />
                  </HStack>
                </HStack>

                <VStack align="stretch" spacing={2} fontSize="sm">
                  <HStack justify="space-between">
                    <Text color="gray.400">IP:</Text>
                    <Code colorScheme="blue">{host.ip}</Code>
                  </HStack>
                  <HStack justify="space-between">
                    <Text color="gray.400">MAC:</Text>
                    <Code fontSize="xs">{host.mac}</Code>
                  </HStack>
                  <HStack justify="space-between">
                    <Text color="gray.400">Interface:</Text>
                    <Badge colorScheme={isWifi ? "cyan" : "purple"}>
                      {isWifi ? "WiFi" : "LAN"} {host.band && `(${host.band})`}
                    </Badge>
                  </HStack>
                  {host.vendorId && (
                    <HStack justify="space-between">
                      <Text color="gray.400">Vendor:</Text>
                      <Text color="gray.300">{host.vendorId}</Text>
                    </HStack>
                  )}
                  {host.leaseTime > 0 && (
                    <HStack justify="space-between">
                      <Text color="gray.400">Lease:</Text>
                      <Text color="gray.300">{formatSeconds(host.leaseTime)}</Text>
                    </HStack>
                  )}
                  {host.rssi && (
                    <HStack justify="space-between">
                      <Text color="gray.400">Sinal:</Text>
                      <HStack>
                        <Icon as={FaSignal} color={host.rssi > -60 ? "green.400" : host.rssi > -75 ? "yellow.400" : "red.400"} />
                        <Text color="gray.300">{host.rssi} dBm</Text>
                      </HStack>
                    </HStack>
                  )}
                </VStack>
              </Box>
            );
          })}
        </SimpleGrid>
      ) : (
        <Box overflowX="auto">
          <Table size="sm" variant="simple">
            <Thead>
              <Tr>
                <Th color="gray.400">Status</Th>
                <Th color="gray.400">Hostname</Th>
                <Th color="gray.400">IP</Th>
                <Th color="gray.400">MAC</Th>
                <Th color="gray.400">Interface</Th>
                <Th color="gray.400">Vendor</Th>
                <Th color="gray.400">Lease</Th>
              </Tr>
            </Thead>
            <Tbody>
              {filteredHosts.map((host, idx) => {
                const isWifi = host.interfaceType === "802.11" || host.interfaceType.includes("WiFi");
                return (
                  <Tr key={idx}>
                    <Td>
                      <Badge colorScheme={host.active ? "green" : "gray"}>
                        {host.active ? "ATIVO" : "INATIVO"}
                      </Badge>
                    </Td>
                    <Td>
                      <HStack>
                        <Icon as={isWifi ? FaWifi : FaNetworkWired} color={isWifi ? "cyan.400" : "purple.400"} />
                        <Text>{host.hostName}</Text>
                      </HStack>
                    </Td>
                    <Td><Code colorScheme="blue">{host.ip}</Code></Td>
                    <Td><Code fontSize="xs">{host.mac}</Code></Td>
                    <Td>
                      <Badge colorScheme={isWifi ? "cyan" : "purple"}>
                        {isWifi ? "WiFi" : "LAN"}
                      </Badge>
                    </Td>
                    <Td>{host.vendorId || "—"}</Td>
                    <Td>{host.leaseTime > 0 ? formatSeconds(host.leaseTime) : "—"}</Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
        </Box>
      )}

      {filteredHosts.length === 0 && (
        <Box textAlign="center" py={8}>
          <Text color="gray.400">Nenhum dispositivo encontrado</Text>
        </Box>
      )}
    </Box>
  );
}
  