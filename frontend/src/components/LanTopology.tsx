// src/components/LanTopology.tsx
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
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Input,
  InputGroup,
  InputLeftElement,
  Select,
  Tabs,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
} from "@chakra-ui/react";
import { useMemo, useState } from "react";
import {
  FaNetworkWired,
  FaWifi,
  FaMobileAlt,
  FaLaptop,
  FaDesktop,
  FaTabletAlt,
  FaTv,
  FaGamepad,
  FaChevronDown,
  FaChevronRight,
  FaSearch,
  FaEthernet,
  FaClock,
  FaPlug,
} from "react-icons/fa";
import { MdRouter, MdDevicesOther } from "react-icons/md";

interface Props {
  device: any;
}

interface LanHost {
  mac: string;
  ip: string;
  hostname: string;
  interfaceType: string;
  active: boolean;
  leaseTime: number;
  vendorId: string;
  layer1Interface?: string;
}

interface EthernetPort {
  name: string;
  status: string;
  speed?: string;
  duplex?: string;
  macAddress?: string;
}

// Helpers
const get = (o: any, path: string, fb?: any): any => {
  try {
    const v = path.split(".").reduce((acc: any, k: string) => acc?.[k], o);
    if (v === undefined || v === null) return fb;
    
    // Handle TR-069 objects with _value - extract the value
    if (typeof v === 'object' && '_value' in v) {
      return v._value ?? fb;
    }
    
    // If it's an object without _value, it may be a container - return the object
    if (typeof v === 'object') {
      return v;
    }
    
    return v ?? fb;
  } catch {
    return fb;
  }
};

// Safe coercion for values returned by the NBI which sometimes are objects
// like {_object: true, _writable: false, _timestamp: "..."} — prefer _value when present
const safeDisplay = (x: any, fb: any = ""): string => {
  if (x === null || x === undefined) return fb;
  if (typeof x === "string" || typeof x === "number" || typeof x === "boolean") return String(x);
  // If it's an object coming from the NBI, try to use _value
  if (typeof x === "object") {
    if ("_value" in x) return String(x._value ?? fb);
    // Sometimes nested structures exist; try to find a scalar child
    for (const k of Object.keys(x)) {
      const v = (x as any)[k];
      if (v === null || v === undefined) continue;
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v);
      if (typeof v === "object" && "_value" in v) return String(v._value ?? fb);
    }
    try {
      return JSON.stringify(x);
    } catch {
      return fb;
    }
  }
  return String(x);
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

// Identificar dispositivo
const getDeviceIcon = (host: LanHost) => {
  const name = (host.hostname + host.vendorId).toLowerCase();
  if (name.includes("iphone") || name.includes("android") || name.includes("samsung") || name.includes("xiaomi")) {
    return FaMobileAlt;
  }
  if (name.includes("macbook") || name.includes("laptop") || name.includes("notebook")) {
    return FaLaptop;
  }
  if (name.includes("ipad") || name.includes("tablet")) {
    return FaTabletAlt;
  }
  if (name.includes("tv") || name.includes("roku") || name.includes("chromecast")) {
    return FaTv;
  }
  if (name.includes("playstation") || name.includes("xbox")) {
    return FaGamepad;
  }
  if (name.includes("desktop") || name.includes("pc-")) {
    return FaDesktop;
  }
  return MdDevicesOther;
};

const formatLease = (seconds: number): string => {
  if (!seconds || isNaN(seconds)) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${seconds}s`;
};

export default function LanTopology({ device }: Props) {
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    wifi: true,
    lan: true,
    ports: true,
  });

  // Extrair hosts da tabela de hosts
  const hosts = useMemo<LanHost[]>(() => {
    const hostsData = 
      get(device, "InternetGatewayDevice.LANDevice.1.Hosts.Host", null) ||
      get(device, "Device.Hosts.Host", null);
    
    if (!hostsData) return [];
    
    return Object.entries(hostsData).map(([, h]: [string, any]) => {
      const macRaw = get(h, "MACAddress", get(h, "PhysicalAddress", ""));
      const mac = safeDisplay(macRaw, "");

      // Normalizar interfaceType para string antes de usar includes
      const rawItf = get(h, "InterfaceType", get(h, "Layer1Interface", "")) ?? get(h, "InterfaceType", "");
      const itfStr = safeDisplay(rawItf, "");
      const isWifi = itfStr.toLowerCase().includes("wifi") || itfStr.includes("802.11");

      return {
        mac,
        ip: safeDisplay(get(h, "IPAddress", ""), ""),
        hostname: safeDisplay(get(h, "HostName", get(h, "X_TP_HostName", "Desconhecido")), "Desconhecido"),
        interfaceType: isWifi ? "WiFi" : "Ethernet",
        active: get(h, "Active", false) === true || safeDisplay(get(h, "Active", "")) === "1",
        leaseTime: Number(safeDisplay(get(h, "LeaseTimeRemaining", 0), 0)) || 0,
        vendorId: safeDisplay(get(h, "VendorClassID", "")) || getVendor(mac),
        layer1Interface: safeDisplay(get(h, "Layer1Interface", get(h, "X_TP_ConnIntf", "")), ""),
      };
    }).filter(h => h.mac);
  }, [device]);

  // Extrair portas Ethernet
  const ethernetPorts = useMemo<EthernetPort[]>(() => {
    const ethData = 
      get(device, "InternetGatewayDevice.LANDevice.1.LANEthernetInterfaceConfig", null) ||
      get(device, "Device.Ethernet.Interface", null);
    
    if (!ethData) return [];
    
    return Object.entries(ethData).map(([idx, port]: [string, any]) => ({
      name: safeDisplay(get(port, "Name", get(port, "X_TP_IfName", `LAN${idx}`)), `LAN${idx}`),
      status: safeDisplay(get(port, "Status", "Unknown"), "Unknown"),
      speed: safeDisplay(get(port, "MaxBitRate", get(port, "CurrentBitRate", "")), ""),
      duplex: safeDisplay(get(port, "DuplexMode", ""), ""),
      macAddress: safeDisplay(get(port, "MACAddress", ""), ""),
    }));
  }, [device]);

  // Agrupar hosts
  const grouped = useMemo(() => {
    const wifi = hosts.filter(h => h.interfaceType === "WiFi");
    const lan = hosts.filter(h => h.interfaceType !== "WiFi");
    return { wifi, lan };
  }, [hosts]);

  // Filtrar hosts
  const filtered = useMemo(() => {
    return hosts.filter(h => {
      const searchLower = search.toLowerCase();
      const matchSearch = !search ||
        h.hostname.toLowerCase().includes(searchLower) ||
        h.ip.includes(searchLower) ||
        h.mac.toLowerCase().includes(searchLower);
      
      const matchType = filterType === "all" ||
        (filterType === "active" && h.active) ||
        (filterType === "wifi" && h.interfaceType === "WiFi") ||
        (filterType === "lan" && h.interfaceType !== "WiFi");
      
      return matchSearch && matchType;
    });
  }, [hosts, search, filterType]);

  const toggleGroup = (group: string) => {
    setExpandedGroups(prev => ({ ...prev, [group]: !prev[group] }));
  };

  const stats = {
    total: hosts.length,
    active: hosts.filter(h => h.active).length,
    wifi: grouped.wifi.length,
    lan: grouped.lan.length,
  };

  return (
    <Box>
      {/* Estatísticas */}
      <SimpleGrid columns={{ base: 2, md: 4 }} spacing={4} mb={6}>
        <Stat bg="gray.700" p={3} borderRadius="lg">
          <StatLabel color="gray.400" fontSize="xs">Total Hosts</StatLabel>
          <StatNumber color="white" fontSize="xl">{stats.total}</StatNumber>
        </Stat>
        <Stat bg="gray.700" p={3} borderRadius="lg">
          <StatLabel color="gray.400" fontSize="xs">Ativos</StatLabel>
          <StatNumber color="green.400" fontSize="xl">{stats.active}</StatNumber>
        </Stat>
        <Stat bg="gray.700" p={3} borderRadius="lg">
          <StatLabel color="gray.400" fontSize="xs">WiFi</StatLabel>
          <StatNumber color="cyan.400" fontSize="xl">{stats.wifi}</StatNumber>
        </Stat>
        <Stat bg="gray.700" p={3} borderRadius="lg">
          <StatLabel color="gray.400" fontSize="xs">Ethernet</StatLabel>
          <StatNumber color="purple.400" fontSize="xl">{stats.lan}</StatNumber>
        </Stat>
      </SimpleGrid>

      <Tabs variant="soft-rounded" colorScheme="cyan" size="sm">
        <TabList mb={4}>
          <Tab>🌳 Topologia</Tab>
          <Tab>📋 Tabela</Tab>
          <Tab>🔌 Portas</Tab>
        </TabList>

        <TabPanels>
          {/* Visão em árvore */}
          <TabPanel p={0}>
            <Box bg="gray.800" p={4} borderRadius="xl" border="1px solid" borderColor="gray.700">
              {/* Router */}
              <HStack spacing={3} mb={4}>
                <Box bg="blue.600" p={3} borderRadius="full">
                  <Icon as={MdRouter} boxSize={6} color="white" />
                </Box>
                <VStack align="start" spacing={0}>
                  <Text fontWeight="bold" color="white">
                    {device?._deviceId?._ProductClass || "Router/Gateway"}
                  </Text>
                  <Text fontSize="xs" color="gray.400">
                    {get(device, "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.IPAddress", 
                         get(device, "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.IPInterface.1.IPInterfaceIPAddress", "192.168.1.1"))}
                  </Text>
                </VStack>
              </HStack>

              <Divider borderColor="gray.600" mb={4} />

              <VStack align="stretch" spacing={4} pl={4}>
                {/* WiFi Branch */}
                <Box>
                  <HStack
                    spacing={3}
                    cursor="pointer"
                    onClick={() => toggleGroup("wifi")}
                    _hover={{ bg: "whiteAlpha.100" }}
                    p={2}
                    borderRadius="md"
                  >
                    <Box w="2px" h="40px" bg="cyan.500" />
                    <IconButton
                      aria-label="Expandir"
                      icon={expandedGroups.wifi ? <FaChevronDown /> : <FaChevronRight />}
                      size="xs"
                      variant="ghost"
                    />
                    <Box bg="cyan.600" p={2} borderRadius="lg">
                      <Icon as={FaWifi} color="white" />
                    </Box>
                    <Text fontWeight="bold" color="white" flex={1}>Clientes WiFi</Text>
                    <Badge colorScheme="cyan">{grouped.wifi.length}</Badge>
                  </HStack>

                  <Collapse in={expandedGroups.wifi}>
                    <VStack align="stretch" spacing={2} pl={12} mt={2}>
                      {grouped.wifi.length > 0 ? (
                        grouped.wifi.map((host) => {
                          const DeviceIcon = getDeviceIcon(host);
                          return (
                            <HStack
                              key={host.mac}
                              bg="gray.700"
                              p={3}
                              borderRadius="lg"
                              spacing={3}
                            >
                              <Box w="20px" h="2px" bg="cyan.500" />
                              <Box bg="gray.600" p={2} borderRadius="md">
                                <Icon as={DeviceIcon} color="white" />
                              </Box>
                              <VStack align="start" spacing={0} flex={1}>
                                <HStack>
                                  <Text fontWeight="semibold" color="white" fontSize="sm">
                                    {host.hostname}
                                  </Text>
                                  <Badge colorScheme={host.active ? "green" : "gray"} size="sm">
                                    {host.active ? "Ativo" : "Inativo"}
                                  </Badge>
                                </HStack>
                                <HStack spacing={2}>
                                  <Code fontSize="xs" bg="blackAlpha.400">{host.ip}</Code>
                                  <Text fontSize="xs" color="gray.500">{host.mac}</Text>
                                </HStack>
                              </VStack>
                              {host.vendorId && (
                                <Badge colorScheme="gray" size="sm">{host.vendorId}</Badge>
                              )}
                            </HStack>
                          );
                        })
                      ) : (
                        <Text color="gray.400" fontSize="sm" p={4}>
                          Nenhum cliente WiFi conectado
                        </Text>
                      )}
                    </VStack>
                  </Collapse>
                </Box>

                {/* LAN Branch */}
                <Box>
                  <HStack
                    spacing={3}
                    cursor="pointer"
                    onClick={() => toggleGroup("lan")}
                    _hover={{ bg: "whiteAlpha.100" }}
                    p={2}
                    borderRadius="md"
                  >
                    <Box w="2px" h="40px" bg="purple.500" />
                    <IconButton
                      aria-label="Expandir"
                      icon={expandedGroups.lan ? <FaChevronDown /> : <FaChevronRight />}
                      size="xs"
                      variant="ghost"
                    />
                    <Box bg="purple.600" p={2} borderRadius="lg">
                      <Icon as={FaNetworkWired} color="white" />
                    </Box>
                    <Text fontWeight="bold" color="white" flex={1}>Clientes Ethernet</Text>
                    <Badge colorScheme="purple">{grouped.lan.length}</Badge>
                  </HStack>

                  <Collapse in={expandedGroups.lan}>
                    <VStack align="stretch" spacing={2} pl={12} mt={2}>
                      {grouped.lan.length > 0 ? (
                        grouped.lan.map((host) => {
                          const DeviceIcon = getDeviceIcon(host);
                          return (
                            <HStack
                              key={host.mac}
                              bg="gray.700"
                              p={3}
                              borderRadius="lg"
                              spacing={3}
                            >
                              <Box w="20px" h="2px" bg="purple.500" />
                              <Box bg="gray.600" p={2} borderRadius="md">
                                <Icon as={DeviceIcon} color="white" />
                              </Box>
                              <VStack align="start" spacing={0} flex={1}>
                                <HStack>
                                  <Text fontWeight="semibold" color="white" fontSize="sm">
                                    {host.hostname}
                                  </Text>
                                  <Badge colorScheme={host.active ? "green" : "gray"} size="sm">
                                    {host.active ? "Ativo" : "Inativo"}
                                  </Badge>
                                </HStack>
                                <HStack spacing={2}>
                                  <Code fontSize="xs" bg="blackAlpha.400">{host.ip}</Code>
                                  <Text fontSize="xs" color="gray.500">{host.mac}</Text>
                                </HStack>
                              </VStack>
                              {host.leaseTime > 0 && (
                                <Tooltip label="Tempo restante do DHCP">
                                  <HStack spacing={1}>
                                    <Icon as={FaClock} color="gray.400" boxSize={3} />
                                    <Text fontSize="xs" color="gray.400">{formatLease(host.leaseTime)}</Text>
                                  </HStack>
                                </Tooltip>
                              )}
                            </HStack>
                          );
                        })
                      ) : (
                        <Text color="gray.400" fontSize="sm" p={4}>
                          Nenhum cliente Ethernet conectado
                        </Text>
                      )}
                    </VStack>
                  </Collapse>
                </Box>
              </VStack>
            </Box>
          </TabPanel>

          {/* Visão em tabela */}
          <TabPanel p={0}>
            <Box bg="gray.800" p={4} borderRadius="xl" border="1px solid" borderColor="gray.700">
              {/* Filtros */}
              <HStack spacing={4} mb={4}>
                <InputGroup maxW="300px">
                  <InputLeftElement>
                    <Icon as={FaSearch} color="gray.400" />
                  </InputLeftElement>
                  <Input
                    placeholder="Buscar..."
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
                  <option value="lan">Ethernet</option>
                </Select>
              </HStack>

              <Box overflowX="auto">
                <Table size="sm">
                  <Thead>
                    <Tr>
                      <Th color="gray.400">Status</Th>
                      <Th color="gray.400">Dispositivo</Th>
                      <Th color="gray.400">IP</Th>
                      <Th color="gray.400">MAC</Th>
                      <Th color="gray.400">Interface</Th>
                      <Th color="gray.400">Lease</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {filtered.map((host) => (
                      <Tr key={host.mac}>
                        <Td>
                          <Badge colorScheme={host.active ? "green" : "gray"}>
                            {host.active ? "Ativo" : "Inativo"}
                          </Badge>
                        </Td>
                        <Td>
                          <HStack>
                            <Icon
                              as={host.interfaceType === "WiFi" ? FaWifi : FaNetworkWired}
                              color={host.interfaceType === "WiFi" ? "cyan.400" : "purple.400"}
                            />
                            <VStack align="start" spacing={0}>
                              <Text color="white" fontSize="sm">{host.hostname}</Text>
                              {host.vendorId && (
                                <Text fontSize="xs" color="gray.400">{host.vendorId}</Text>
                              )}
                            </VStack>
                          </HStack>
                        </Td>
                        <Td><Code colorScheme="blue" fontSize="xs">{host.ip}</Code></Td>
                        <Td><Code fontSize="xs">{host.mac}</Code></Td>
                        <Td>
                          <Badge colorScheme={host.interfaceType === "WiFi" ? "cyan" : "purple"}>
                            {host.interfaceType}
                          </Badge>
                        </Td>
                        <Td>
                          <Text fontSize="sm" color="gray.300">{formatLease(host.leaseTime)}</Text>
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </Box>
            </Box>
          </TabPanel>

          {/* Portas físicas */}
          <TabPanel p={0}>
            <Box bg="gray.800" p={4} borderRadius="xl" border="1px solid" borderColor="gray.700">
              <Text fontWeight="bold" color="white" mb={4}>Portas Ethernet Físicas</Text>
              
              <SimpleGrid columns={{ base: 2, md: 4 }} spacing={4}>
                {ethernetPorts.length > 0 ? (
                  ethernetPorts.map((port, idx) => (
                    <Box
                      key={idx}
                      bg="gray.700"
                      p={4}
                      borderRadius="lg"
                      borderLeft="4px solid"
                      borderLeftColor={port.status === "Up" ? "green.500" : "gray.500"}
                    >
                      <HStack mb={2}>
                        <Icon as={FaEthernet} color={port.status === "Up" ? "green.400" : "gray.400"} />
                        <Text fontWeight="bold" color="white">{port.name}</Text>
                      </HStack>
                      <VStack align="start" spacing={1}>
                        <Badge colorScheme={port.status === "Up" ? "green" : "gray"}>
                          {port.status}
                        </Badge>
                        {port.speed && (
                          <Text fontSize="xs" color="gray.400">{port.speed} Mbps</Text>
                        )}
                        {port.duplex && (
                          <Text fontSize="xs" color="gray.400">{port.duplex}</Text>
                        )}
                      </VStack>
                    </Box>
                  ))
                ) : (
                  <Box gridColumn="span 4" textAlign="center" py={8}>
                    <Icon as={FaPlug} boxSize={8} color="gray.500" mb={2} />
                    <Text color="gray.400">
                      Informações de portas não disponíveis para este dispositivo
                    </Text>
                  </Box>
                )}
              </SimpleGrid>
            </Box>
          </TabPanel>
        </TabPanels>
      </Tabs>
    </Box>
  );
}
