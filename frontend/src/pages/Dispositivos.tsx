// src/pages/Dispositivos.tsx
import {
  Box, Table, Thead, Tr, Th, Tbody, Td, Text, Button, TableContainer,
  Badge, useToast, HStack, Modal, ModalOverlay, ModalContent,
  ModalHeader, ModalBody, ModalFooter, useDisclosure, Input, Select, VStack,
  IconButton, Tooltip, Checkbox, Flex, Tag, TagLabel, TagCloseButton,
  Menu, MenuButton, MenuList, MenuItem, Divider, Skeleton, SimpleGrid,
  InputGroup, InputLeftElement, Progress, Grid, GridItem, Switch, Card, CardBody,
  Icon, Heading, ButtonGroup, Wrap, WrapItem, Center, SkeletonCircle
} from "@chakra-ui/react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  getDevices, getDevicesMinimal, deleteDevice, createTask,
  addTag, deleteTag, getFiles, uploadFile,
  pingCustom, refreshCPE
} from "../services/genieAcsApi";
import { useNavigate } from "react-router-dom";
import {
  SearchIcon, CheckCircleIcon, WarningIcon
} from "@chakra-ui/icons";
import { 
  FiWifi, FiGrid, FiList, FiFilter,
  FiRefreshCw, FiMoreVertical, FiEye, FiPower, FiTrash2, FiTag, FiUpload
} from "react-icons/fi";
import { MdRouter, MdSettingsEthernet, MdDevices } from "react-icons/md";

// =========================
// Tipos
// =========================
interface CPE {
  _id: string;
  _lastInform?: string | null;
  _tags?: string[];
  _deviceId: {
    _SerialNumber: string;
    _Manufacturer: string;
    _ProductClass: string;
  };
  InternetGatewayDevice?: Record<string, unknown>;
  Device?: Record<string, unknown>; // TR-181
  _online?: boolean;
}

type SortKey =
  | "login" | "serial" | "fabricante" | "modelo"
  | "firmware" | "tag" | "online" | "ultimoInform" | "ip" | "ssid" | "tipo";

type ViewMode = "table" | "cards";

// =========================
// Utils
// =========================
function isOnlineFromInform(lastInform?: string | null, mins = 10): boolean {
  if (!lastInform) return false;
  const last = new Date(lastInform).getTime();
  return (Date.now() - last) / 60000 < mins;
}

function timeAgo(date?: string | null): string {
  if (!date) return "-";
  const d = new Date(date).getTime();
  const diff = Math.max(0, Date.now() - d);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function gv(obj: Record<string, unknown> | undefined, path: string[], fb: unknown = "-"): unknown {
  try {
    const v = path.reduce((a: unknown, k: string) => {
      if (a && typeof a === 'object' && k in a) {
        return (a as Record<string, unknown>)[k];
      }
      return undefined;
    }, obj);
    if (v === undefined || v === null) return fb;
    if (typeof v === 'object' && v !== null && '_value' in v) return (v as Record<string, unknown>)._value ?? fb;
    if (typeof v === 'object') return v;
    return v ?? fb;
  } catch { return fb; }
}

const PING_AVG_RE = /=\s*([\d.]+)\/([\d.]+)\/([\d.]+)\//;

// Heurística de tipo
function detectTipo(cpe: CPE): "ROUTER" | "ONU" | "BRIDGE" {
  const igd = cpe?.InternetGatewayDevice || {};
  const dev = cpe?.Device || {}; // TR-181
  
  // TR-098 checks
  const hasPPPUser098 = !!gv(igd, ["WANDevice","1","WANConnectionDevice","1","WANPPPConnection","1","Username"], "");
  const hasWLAN098 = !!gv(igd, ["LANDevice","1","WLANConfiguration","1","SSID"], "")
               || !!gv(igd, ["LANDevice","1","WLANConfiguration","2","SSID"], "");
  
  // TR-181 checks
  const hasPPPUser181 = !!gv(dev, ["PPP","Interface","1","Username"], "")
                     || !!gv(dev, ["PPP","Interface","2","Username"], "");
  const hasWLAN181 = !!gv(dev, ["WiFi","SSID","1","SSID"], "")
                  || !!gv(dev, ["WiFi","SSID","2","SSID"], "");
  
  const hasPPPUser = hasPPPUser098 || hasPPPUser181;
  const hasWLAN = hasWLAN098 || hasWLAN181;
  
  const mfr = (cpe?._deviceId?._Manufacturer || "").toUpperCase();
  const cls = (cpe?._deviceId?._ProductClass || "").toUpperCase();

  if (hasPPPUser || hasWLAN) return "ROUTER";
  if (!hasPPPUser && (mfr.includes("ZTE") || mfr.includes("HUAWEI") || cls.includes("H196") || cls.includes("HG"))) {
    return "ONU";
  }
  const hasEther = !!gv(igd, ["LANDevice","1","LANEthernetInterfaceConfig","1","Status"], "")
                || !!gv(dev, ["Ethernet","Interface","1","Status"], "");
  if (!hasPPPUser && hasEther) return "BRIDGE";
  return "ROUTER";
}

// Cor do fabricante
function getManufacturerColor(manufacturer: string): string {
  const m = manufacturer.toUpperCase();
  if (m.includes("TP-LINK") || m.includes("TPLINK")) return "green";
  if (m.includes("HUAWEI")) return "red";
  if (m.includes("ZTE")) return "blue";
  if (m.includes("INTELBRAS")) return "purple";
  if (m.includes("NOKIA")) return "cyan";
  if (m.includes("FIBERHOME")) return "orange";
  return "gray";
}

// =========================
// Página
// =========================
export default function Dispositivos() {
  const [cpes, setCpes] = useState<CPE[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);

  // View mode
  const [viewMode, setViewMode] = useState<ViewMode>("table");

  // filtros & busca
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "online" | "offline">("all");
  const [fabricanteFilter, setFabricanteFilter] = useState<string>("all");
  const [modeloFilter, setModeloFilter] = useState<string>("all");
  const [_tagFilter, _setTagFilter] = useState<string>("all");
  const [tipoFilter, setTipoFilter] = useState<"all" | "router" | "onu" | "bridge">("all");
  const [showFilters, setShowFilters] = useState(true);

  // Suppress unused warnings
  void _tagFilter;
  void _setTagFilter;

  // ordenação
  const [sortKey, setSortKey] = useState<SortKey>("online");
  const [sortAsc, setSortAsc] = useState(false);

  // paginação
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(24);

  // modais
  const { isOpen: isPushOpen, onOpen: onPushOpen, onClose: onPushClose } = useDisclosure();
  const { isOpen: isTagOpen, onOpen: onTagOpen, onClose: onTagClose } = useDisclosure();

  // push/tag state
  const [tagValue, setTagValue] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState("");
  const [uploadFileData, setUploadFileData] = useState<File | null>(null);

  // auto refresh
  const [autoRefresh, setAutoRefresh] = useState(true);
  const intervalRef = useRef<number | null>(null);

  const toast = useToast();
  const navigate = useNavigate();

  // Cache
  const CACHE_KEY = "semppre_devices_cache";
  const CACHE_TTL = 30000;

  // Suppress unused warnings  
  void sortKey;
  void setSortKey;
  void sortAsc;
  void setSortAsc;

  useEffect(() => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const { data, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < 300000 && Array.isArray(data)) {
          setCpes(data.map((d: CPE) => ({ ...d, _online: isOnlineFromInform(d._lastInform) })));
          if (Date.now() - timestamp > CACHE_TTL) setLoading(true);
          else setLoading(false);
        }
      }
    } catch { /* empty */ }
  }, []);

  const fetchData = async (forceFullData = false) => {
    try {
      if (cpes.length === 0) setLoading(true);
      const data = forceFullData ? await getDevices() : await getDevicesMinimal();
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }));
      } catch { /* empty */ }
      setCpes(data.map((d: CPE) => ({ ...d, _online: isOnlineFromInform(d._lastInform) })));
    } catch {
      toast({ status: "error", title: "Erro ao buscar dispositivos" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      try {
        const { timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < CACHE_TTL) {
          const timeout = setTimeout(() => fetchData(), CACHE_TTL - (Date.now() - timestamp));
          return () => clearTimeout(timeout);
        }
      } catch { /* empty */ }
    }
    fetchData();
  }, []);

  useEffect(() => {
    if (!autoRefresh) {
      if (intervalRef.current) { window.clearInterval(intervalRef.current); intervalRef.current = null; }
      return;
    }
    intervalRef.current = window.setInterval(() => fetchData(), 30000) as unknown as number;
    return () => { if (intervalRef.current) window.clearInterval(intervalRef.current); };
  }, [autoRefresh]);

  // Dados enriquecidos
  const rows = useMemo(() => {
    return cpes.map((cpe) => {
      const igd = cpe?.InternetGatewayDevice || {};
      const dev = cpe?.Device || {}; // TR-181
      
      // Login - TR-098 e TR-181
      const login = String(
        gv(igd, ["WANDevice","1","WANConnectionDevice","1","WANPPPConnection","1","Username"], "") ||
        gv(igd, ["WANDevice","1","WANConnectionDevice","1","WANPPPConnection","2","Username"], "") || // ZTE
        gv(dev, ["PPP","Interface","1","Username"], "") || // TP-Link TR-181
        gv(dev, ["PPP","Interface","2","Username"], "") || // Zyxel TR-181
        "-"
      );
      
      // IP - TR-098 e TR-181 (múltiplos caminhos)
      const ip = String(
        gv(igd, ["WANDevice","1","WANConnectionDevice","1","WANPPPConnection","1","ExternalIPAddress"], "") ||
        gv(igd, ["WANDevice","1","WANConnectionDevice","1","WANPPPConnection","2","ExternalIPAddress"], "") || // ZTE
        gv(igd, ["WANDevice","1","WANConnectionDevice","1","WANIPConnection","1","ExternalIPAddress"], "") || // D-Link/DHCP
        gv(dev, ["PPP","Interface","1","IPCP","LocalIPAddress"], "") || // TP-Link EC220-G5 TR-181
        gv(dev, ["PPP","Interface","2","IPCP","LocalIPAddress"], "") || // Zyxel TR-181
        gv(dev, ["IP","Interface","3","IPv4Address","1","IPAddress"], "") || // TR-181 WAN
        gv(dev, ["IP","Interface","1","IPv4Address","1","IPAddress"], "") || // TR-181 fallback
        "-"
      );
      
      // SSID - TR-098 e TR-181
      const ssid = String(
        gv(igd, ["LANDevice","1","WLANConfiguration","1","SSID"], "") ||
        gv(igd, ["LANDevice","1","WLANConfiguration","2","SSID"], "") ||
        gv(dev, ["WiFi","SSID","1","SSID"], "") || // TR-181 WiFi
        gv(dev, ["WiFi","SSID","2","SSID"], "") || // TR-181 5GHz
        "-"
      );
      
      // Firmware - TR-098 e TR-181
      const firmware = String(
        gv(igd, ["DeviceInfo","SoftwareVersion"], "") ||
        gv(igd, ["DeviceInfo","FirmwareVersion"], "") ||
        gv(dev, ["DeviceInfo","SoftwareVersion"], "") || // TR-181
        gv(dev, ["DeviceInfo","FirmwareVersion"], "") || // TR-181
        "-"
      );
      
      const tag = cpe._tags?.[0] || "";
      const online = cpe._online ?? isOnlineFromInform(cpe._lastInform);
      const ultimo = cpe._lastInform || null;
      const fabricante = cpe._deviceId?._Manufacturer || "-";
      const modelo = cpe._deviceId?._ProductClass || "-";
      const serial = cpe._deviceId?._SerialNumber || "-";
      const tipo = detectTipo(cpe);

      return { cpe, id: cpe._id, login, ip: ip || "-", ssid, firmware, tag, online, ultimo, fabricante, modelo, serial, tipo };
    });
  }, [cpes]);

  type Row = (typeof rows)[number];

  const fabricantes = useMemo(
    () => ["all", ...Array.from(new Set(rows.map(r => r.fabricante).filter(Boolean)))],
    [rows]
  );
  const modelos = useMemo(
    () => ["all", ...Array.from(new Set(rows.map(r => r.modelo).filter(Boolean)))],
    [rows]
  );
  const tags = useMemo(
    () => ["all", ...Array.from(new Set(rows.map(r => r.tag).filter(t => t && t !== "-")))],
    [rows]
  );

  // Suppress unused
  void tags;

  // Estatísticas
  const stats = useMemo(() => {
    const total = rows.length;
    const online = rows.filter(r => r.online).length;
    const offline = total - online;
    const routers = rows.filter(r => r.tipo === "ROUTER").length;
    const onus = rows.filter(r => r.tipo === "ONU" || r.tipo === "BRIDGE").length;
    
    const byManufacturer: Record<string, number> = {};
    rows.forEach(r => {
      const fab = r.fabricante || 'Outros';
      byManufacturer[fab] = (byManufacturer[fab] || 0) + 1;
    });
    
    return { total, online, offline, routers, onus, byManufacturer };
  }, [rows]);

  // Filtros
  const filtered = useMemo(() => {
    const qNorm = q.trim().toLowerCase();
    return rows.filter(r => {
      if (statusFilter !== "all" && ((statusFilter === "online") !== r.online)) return false;
      if (tipoFilter !== "all") {
        if (tipoFilter === "router" && r.tipo !== "ROUTER") return false;
        if (tipoFilter === "onu" && r.tipo !== "ONU") return false;
        if (tipoFilter === "bridge" && r.tipo !== "BRIDGE") return false;
      }
      if (fabricanteFilter !== "all" && r.fabricante !== fabricanteFilter) return false;
      if (modeloFilter !== "all" && r.modelo !== modeloFilter) return false;
      if (!qNorm) return true;
      const blob = `${r.login} ${r.serial} ${r.fabricante} ${r.modelo} ${r.firmware} ${r.tag} ${r.ip} ${r.ssid} ${r.tipo}`.toLowerCase();
      return blob.includes(qNorm);
    });
  }, [rows, q, statusFilter, fabricanteFilter, modeloFilter, tipoFilter]);

  // Ordenação
  const sorted = useMemo(() => {
    const data = [...filtered];
    data.sort((a, b) => {
      // Sort by online status first (online comes first)
      if (a.online !== b.online) return a.online ? -1 : 1;
      // Then by login/serial
      const aKey = a.login !== "-" ? a.login : a.serial;
      const bKey = b.login !== "-" ? b.login : b.serial;
      return aKey.localeCompare(bKey);
    });
    return data;
  }, [filtered]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const pageData = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, page, pageSize]);

  useEffect(() => { setPage(1); }, [q, statusFilter, fabricanteFilter, modeloFilter, tipoFilter, pageSize]);

  // Ações
  type TaskName = "reboot" | "factoryReset" | "refreshObject" | "download" | "setParameterValues" | "getParameterValues";

  const executarTask = async (deviceId: string, name: TaskName, params?: Record<string, unknown>) => {
    try {
      await createTask(deviceId, { name, ...params } as Parameters<typeof createTask>[1], true);
      toast({ status: "success", title: `Comando ${name} enviado` });
    } catch {
      toast({ status: "error", title: `Erro ao executar ${name}` });
    }
  };

  const abrirModalTag = (id: string, tagAtual?: string) => {
    setSelectedDevice(id);
    setTagValue(tagAtual || "");
    onTagOpen();
  };

  const enviarTag = async () => {
    if (!selectedDevice || !tagValue) return;
    try {
      await addTag(selectedDevice, tagValue);
      toast({ status: "success", title: `Tag adicionada` });
      fetchData();
    } catch {
      toast({ status: "error", title: "Erro ao adicionar tag" });
    }
    onTagClose();
  };

  const removerTag = async (id: string, tagAtual?: string) => {
    try {
      await deleteTag(id, tagAtual || "custom");
      toast({ status: "success", title: "Tag removida" });
      fetchData();
    } catch {
      toast({ status: "error", title: "Erro ao remover tag" });
    }
  };

  const abrirModalPush = async (id: string) => {
    setSelectedDevice(id);
    const lista = await getFiles();
    setFiles(lista.map((f: { name: string }) => f.name));
    onPushOpen();
  };

  const enviarPush = async () => {
    if (!selectedDevice) return;
    if (uploadFileData) {
      try {
        await uploadFile(uploadFileData.name, uploadFileData, { fileType: "1 Firmware Upgrade Image" });
        toast({ status: "success", title: `Upload: ${uploadFileData.name}` });
      } catch {
        toast({ status: "error", title: "Erro no upload" });
        return;
      }
    }
    if (selectedFile) {
      await executarTask(selectedDevice, "download", { file: selectedFile });
    }
    onPushClose();
  };

  const testarConectividade = async (row: Row) => {
    const ip = row.ip && row.ip !== "-" ? String(row.ip) : "";
    if (ip) {
      try {
        const r = await pingCustom(ip);
        const m = r.stdout.match(PING_AVG_RE);
        const avg = m ? Number(m[2]) : undefined;
        toast({
          status: "info",
          title: avg !== undefined ? `Ping ${ip}: ${avg.toFixed(1)} ms` : `Ping executado`,
          duration: 3000,
        });
      } catch {
        toast({ status: "warning", title: `Ping falhou`, description: ip });
      }
    }
    try {
      await refreshCPE(row.id);
      toast({ status: "success", title: "Inform solicitado" });
    } catch { /* empty */ }
    finally {
      setTimeout(fetchData, 2000);
    }
  };

  const clearFilters = () => {
    setQ(""); setStatusFilter("all"); setFabricanteFilter("all");
    setModeloFilter("all"); setTipoFilter("all");
  };

  const hasActiveFilters = statusFilter !== "all" || fabricanteFilter !== "all" || 
                           modeloFilter !== "all" || tipoFilter !== "all" || q !== "";

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <Box minH="100vh" bg="gray.900">
      {/* HEADER */}
      <Box 
        bg="gray.800" 
        borderBottom="1px solid" 
        borderColor="whiteAlpha.100"
        px={6} 
        py={4}
        position="sticky"
        top={0}
        zIndex={10}
      >
        <Flex align="center" justify="space-between">
          <HStack spacing={4}>
            <Box p={2} bg="cyan.500" borderRadius="lg">
              <Icon as={MdDevices} boxSize={6} color="white" />
            </Box>
            <Box>
              <Heading size="md" color="white">Dispositivos CPE</Heading>
              <Text fontSize="sm" color="whiteAlpha.600">
                Gerenciamento TR-069/CWMP
              </Text>
            </Box>
          </HStack>

          <HStack spacing={3}>
            {/* View Toggle */}
            <ButtonGroup size="sm" isAttached variant="outline">
              <Tooltip label="Visualização em Tabela">
                <IconButton
                  aria-label="Tabela"
                  icon={<FiList />}
                  onClick={() => setViewMode("table")}
                  colorScheme={viewMode === "table" ? "cyan" : "gray"}
                  variant={viewMode === "table" ? "solid" : "outline"}
                />
              </Tooltip>
              <Tooltip label="Visualização em Cards">
                <IconButton
                  aria-label="Cards"
                  icon={<FiGrid />}
                  onClick={() => setViewMode("cards")}
                  colorScheme={viewMode === "cards" ? "cyan" : "gray"}
                  variant={viewMode === "cards" ? "solid" : "outline"}
                />
              </Tooltip>
            </ButtonGroup>

            <Divider orientation="vertical" h={6} borderColor="whiteAlpha.300" />

            {/* Auto Refresh */}
            <HStack spacing={2}>
              <Text fontSize="sm" color="whiteAlpha.600">Auto</Text>
              <Switch 
                size="sm" 
                colorScheme="cyan" 
                isChecked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
              />
            </HStack>

            <Tooltip label="Atualizar agora">
              <IconButton 
                aria-label="Refresh" 
                icon={<FiRefreshCw />} 
                size="sm"
                variant="ghost"
                colorScheme="cyan"
                onClick={() => fetchData()}
                isLoading={loading}
              />
            </Tooltip>

            <Tooltip label={showFilters ? "Ocultar filtros" : "Mostrar filtros"}>
              <IconButton 
                aria-label="Filtros" 
                icon={<FiFilter />} 
                size="sm"
                variant={showFilters ? "solid" : "ghost"}
                colorScheme={hasActiveFilters ? "orange" : "gray"}
                onClick={() => setShowFilters(!showFilters)}
              />
            </Tooltip>
          </HStack>
        </Flex>
      </Box>

      <Box p={6}>
        {/* STATS CARDS */}
        <SimpleGrid columns={{ base: 2, md: 4, lg: 5 }} spacing={4} mb={6}>
          <Card bg="gray.800" border="1px solid" borderColor="whiteAlpha.100">
            <CardBody py={4}>
              <HStack justify="space-between">
                <Box>
                  <Text fontSize="xs" color="whiteAlpha.500" textTransform="uppercase" fontWeight="bold">
                    Total
                  </Text>
                  <Text fontSize="2xl" fontWeight="bold" color="white">{stats.total}</Text>
                </Box>
                <Box p={3} bg="cyan.500" borderRadius="lg" opacity={0.8}>
                  <Icon as={MdDevices} boxSize={5} color="white" />
                </Box>
              </HStack>
            </CardBody>
          </Card>

          <Card 
            bg="gray.800" 
            border="1px solid" 
            borderColor="green.500"
            cursor="pointer"
            onClick={() => setStatusFilter(statusFilter === "online" ? "all" : "online")}
            _hover={{ bg: "gray.750" }}
          >
            <CardBody py={4}>
              <HStack justify="space-between">
                <Box>
                  <Text fontSize="xs" color="green.300" textTransform="uppercase" fontWeight="bold">
                    Online
                  </Text>
                  <HStack spacing={2} align="baseline">
                    <Text fontSize="2xl" fontWeight="bold" color="green.400">{stats.online}</Text>
                    <Text fontSize="sm" color="whiteAlpha.500">
                      {stats.total > 0 ? `${((stats.online / stats.total) * 100).toFixed(0)}%` : '0%'}
                    </Text>
                  </HStack>
                </Box>
                <Box p={3} bg="green.500" borderRadius="lg" opacity={0.8}>
                  <Icon as={CheckCircleIcon} boxSize={5} color="white" />
                </Box>
              </HStack>
              {stats.total > 0 && (
                <Progress 
                  value={(stats.online / stats.total) * 100} 
                  size="xs" 
                  colorScheme="green" 
                  mt={3}
                  borderRadius="full"
                  bg="whiteAlpha.100"
                />
              )}
            </CardBody>
          </Card>

          <Card 
            bg="gray.800" 
            border="1px solid" 
            borderColor="red.500"
            cursor="pointer"
            onClick={() => setStatusFilter(statusFilter === "offline" ? "all" : "offline")}
            _hover={{ bg: "gray.750" }}
          >
            <CardBody py={4}>
              <HStack justify="space-between">
                <Box>
                  <Text fontSize="xs" color="red.300" textTransform="uppercase" fontWeight="bold">
                    Offline
                  </Text>
                  <HStack spacing={2} align="baseline">
                    <Text fontSize="2xl" fontWeight="bold" color="red.400">{stats.offline}</Text>
                    <Text fontSize="sm" color="whiteAlpha.500">
                      {stats.total > 0 ? `${((stats.offline / stats.total) * 100).toFixed(0)}%` : '0%'}
                    </Text>
                  </HStack>
                </Box>
                <Box p={3} bg="red.500" borderRadius="lg" opacity={0.8}>
                  <Icon as={WarningIcon} boxSize={5} color="white" />
                </Box>
              </HStack>
            </CardBody>
          </Card>

          <Card 
            bg="gray.800" 
            border="1px solid" 
            borderColor="whiteAlpha.100"
            cursor="pointer"
            onClick={() => setTipoFilter(tipoFilter === "router" ? "all" : "router")}
            _hover={{ bg: "gray.750" }}
          >
            <CardBody py={4}>
              <HStack justify="space-between">
                <Box>
                  <Text fontSize="xs" color="whiteAlpha.500" textTransform="uppercase" fontWeight="bold">
                    Routers
                  </Text>
                  <Text fontSize="2xl" fontWeight="bold" color="white">{stats.routers}</Text>
                </Box>
                <Box p={3} bg="purple.500" borderRadius="lg" opacity={0.8}>
                  <Icon as={MdRouter} boxSize={5} color="white" />
                </Box>
              </HStack>
            </CardBody>
          </Card>

          <Card 
            bg="gray.800" 
            border="1px solid" 
            borderColor="whiteAlpha.100"
            cursor="pointer"
            onClick={() => setTipoFilter(tipoFilter === "onu" ? "all" : "onu")}
            _hover={{ bg: "gray.750" }}
          >
            <CardBody py={4}>
              <HStack justify="space-between">
                <Box>
                  <Text fontSize="xs" color="whiteAlpha.500" textTransform="uppercase" fontWeight="bold">
                    ONUs/Bridges
                  </Text>
                  <Text fontSize="2xl" fontWeight="bold" color="white">{stats.onus}</Text>
                </Box>
                <Box p={3} bg="orange.500" borderRadius="lg" opacity={0.8}>
                  <Icon as={MdSettingsEthernet} boxSize={5} color="white" />
                </Box>
              </HStack>
            </CardBody>
          </Card>
        </SimpleGrid>

        {/* FILTERS */}
        {showFilters && (
          <Card bg="gray.800" mb={6} border="1px solid" borderColor="cyan.600">
            <CardBody>
              <Grid templateColumns={{ base: "1fr", md: "2fr 1fr 1fr 1fr 1fr" }} gap={4}>
                <GridItem>
                  <InputGroup size="md">
                    <InputLeftElement>
                      <SearchIcon color="cyan.400" />
                    </InputLeftElement>
                    <Input
                      placeholder="Buscar por login, serial, IP, SSID, fabricante..."
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      bg="gray.700"
                      color="white"
                      border="2px solid"
                      borderColor="gray.600"
                      _placeholder={{ color: "gray.400" }}
                      _hover={{ borderColor: "cyan.500" }}
                      _focus={{ borderColor: "cyan.400", boxShadow: "0 0 0 1px var(--chakra-colors-cyan-400)" }}
                    />
                  </InputGroup>
                </GridItem>

                <GridItem>
                  <Select 
                    size="md" 
                    value={statusFilter} 
                    onChange={(e) => setStatusFilter(e.target.value as "all" | "online" | "offline")}
                    bg="gray.700"
                    color="white"
                    border="2px solid"
                    borderColor="gray.600"
                    _hover={{ borderColor: "cyan.500" }}
                    fontWeight="medium"
                  >
                    <option value="all">Status: Todos</option>
                    <option value="online">🟢 Online</option>
                    <option value="offline">🔴 Offline</option>
                  </Select>
                </GridItem>

                <GridItem>
                  <Select 
                    size="md" 
                    value={fabricanteFilter} 
                    onChange={(e) => setFabricanteFilter(e.target.value)}
                    bg="gray.700"
                    color="white"
                    border="2px solid"
                    borderColor="gray.600"
                    _hover={{ borderColor: "cyan.500" }}
                    fontWeight="medium"
                  >
                    {fabricantes.map(f => (
                      <option key={f} value={f}>{f === "all" ? "Fabricante: Todos" : f}</option>
                    ))}
                  </Select>
                </GridItem>

                <GridItem>
                  <Select 
                    size="md" 
                    value={modeloFilter} 
                    onChange={(e) => setModeloFilter(e.target.value)}
                    bg="gray.700"
                    color="white"
                    border="2px solid"
                    borderColor="gray.600"
                    _hover={{ borderColor: "cyan.500" }}
                    fontWeight="medium"
                  >
                    {modelos.map(m => (
                      <option key={m} value={m}>{m === "all" ? "Modelo: Todos" : m}</option>
                    ))}
                  </Select>
                </GridItem>

                <GridItem>
                  <HStack>
                    <Select 
                      size="md" 
                      value={pageSize} 
                      onChange={(e) => setPageSize(Number(e.target.value))}
                      bg="gray.700"
                      color="white"
                      border="2px solid"
                      borderColor="gray.600"
                      _hover={{ borderColor: "cyan.500" }}
                      w="110px"
                      fontWeight="medium"
                    >
                      {[12, 24, 48, 96].map(n => <option key={n} value={n}>{n}/pág</option>)}
                    </Select>
                    {hasActiveFilters && (
                      <Button size="md" variant="solid" colorScheme="orange" onClick={clearFilters}>
                        Limpar
                      </Button>
                    )}
                  </HStack>
                </GridItem>
              </Grid>

              {/* Active Filters Tags */}
              {hasActiveFilters && (
                <Wrap mt={3} spacing={2}>
                  {q && (
                    <WrapItem>
                      <Tag size="sm" colorScheme="cyan" borderRadius="full">
                        <TagLabel>Busca: {q}</TagLabel>
                        <TagCloseButton onClick={() => setQ("")} />
                      </Tag>
                    </WrapItem>
                  )}
                  {statusFilter !== "all" && (
                    <WrapItem>
                      <Tag size="sm" colorScheme={statusFilter === "online" ? "green" : "red"} borderRadius="full">
                        <TagLabel>{statusFilter}</TagLabel>
                        <TagCloseButton onClick={() => setStatusFilter("all")} />
                      </Tag>
                    </WrapItem>
                  )}
                  {fabricanteFilter !== "all" && (
                    <WrapItem>
                      <Tag size="sm" colorScheme="blue" borderRadius="full">
                        <TagLabel>{fabricanteFilter}</TagLabel>
                        <TagCloseButton onClick={() => setFabricanteFilter("all")} />
                      </Tag>
                    </WrapItem>
                  )}
                  {modeloFilter !== "all" && (
                    <WrapItem>
                      <Tag size="sm" colorScheme="purple" borderRadius="full">
                        <TagLabel>{modeloFilter}</TagLabel>
                        <TagCloseButton onClick={() => setModeloFilter("all")} />
                      </Tag>
                    </WrapItem>
                  )}
                </Wrap>
              )}
            </CardBody>
          </Card>
        )}

        {/* BULK ACTIONS BAR */}
        {selectedIds.size > 0 && (
          <Card bg="cyan.900" mb={4} border="1px solid" borderColor="cyan.500">
            <CardBody py={3}>
              <Flex align="center" justify="space-between">
                <HStack spacing={4}>
                  <Text color="white" fontWeight="bold">{selectedIds.size} selecionado(s)</Text>
                  <ButtonGroup size="sm" variant="solid">
                    <Button 
                      colorScheme="green" 
                      leftIcon={<FiPower />}
                      onClick={() => Promise.all(Array.from(selectedIds).map(id => executarTask(id, "reboot"))).then(() => fetchData())}
                    >
                      Reboot
                    </Button>
                    <Button 
                      colorScheme="orange"
                      onClick={() => Promise.all(Array.from(selectedIds).map(id => executarTask(id, "factoryReset"))).then(() => fetchData())}
                    >
                      Reset
                    </Button>
                    <Button 
                      colorScheme="red" 
                      variant="outline"
                      leftIcon={<FiTrash2 />}
                      onClick={() => Promise.all(Array.from(selectedIds).map(id => deleteDevice(id))).then(() => fetchData())}
                    >
                      Deletar
                    </Button>
                  </ButtonGroup>
                </HStack>
                <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
                  Limpar seleção
                </Button>
              </Flex>
            </CardBody>
          </Card>
        )}

        {/* CONTENT */}
        {loading && cpes.length === 0 ? (
          <SimpleGrid columns={{ base: 2, md: 3, lg: 4, xl: 6 }} spacing={4}>
            {Array.from({ length: 12 }).map((_, i) => (
              <Card key={i} bg="gray.800" border="1px solid" borderColor="whiteAlpha.100">
                <CardBody>
                  <VStack spacing={3}>
                    <SkeletonCircle size="12" />
                    <Skeleton height="20px" width="80%" />
                    <Skeleton height="16px" width="60%" />
                  </VStack>
                </CardBody>
              </Card>
            ))}
          </SimpleGrid>
        ) : pageData.length === 0 ? (
          <Card bg="gray.800" border="1px solid" borderColor="whiteAlpha.100">
            <CardBody>
              <Center py={16}>
                <VStack spacing={4}>
                  <Icon as={MdDevices} boxSize={16} color="whiteAlpha.300" />
                  <Text color="whiteAlpha.500" fontSize="lg">Nenhum dispositivo encontrado</Text>
                  {hasActiveFilters && (
                    <Button size="sm" colorScheme="cyan" onClick={clearFilters}>
                      Limpar filtros
                    </Button>
                  )}
                </VStack>
              </Center>
            </CardBody>
          </Card>
        ) : viewMode === "cards" ? (
          /* CARDS VIEW */
          <SimpleGrid columns={{ base: 1, sm: 2, md: 3, lg: 4, xl: 5 }} spacing={4}>
            {pageData.map((r) => (
              <Card 
                key={r.id}
                bg="gray.800"
                border="1px solid"
                borderColor={r.online ? "green.500" : "whiteAlpha.100"}
                borderLeftWidth="4px"
                cursor="pointer"
                transition="all 0.2s"
                _hover={{ 
                  transform: "translateY(-2px)", 
                  boxShadow: "lg",
                  borderColor: r.online ? "green.400" : "whiteAlpha.300"
                }}
                onClick={() => navigate(`/devices/${encodeURIComponent(r.id)}`)}
              >
                <CardBody p={4}>
                  {/* Header */}
                  <Flex justify="space-between" align="start" mb={3}>
                    <HStack spacing={3}>
                      <Box 
                        p={2} 
                        bg={r.online ? "green.500" : "gray.600"} 
                        borderRadius="lg"
                      >
                        <Icon 
                          as={r.tipo === "ROUTER" ? MdRouter : MdSettingsEthernet} 
                          boxSize={5} 
                          color="white" 
                        />
                      </Box>
                      <Box>
                        <Badge 
                          colorScheme={r.online ? "green" : "red"} 
                          fontSize="xs"
                          mb={1}
                        >
                          {r.online ? "ONLINE" : "OFFLINE"}
                        </Badge>
                        <Text fontSize="xs" color="whiteAlpha.500">{timeAgo(r.ultimo)}</Text>
                      </Box>
                    </HStack>
                    
                    <Checkbox
                      isChecked={selectedIds.has(r.id)}
                      onChange={(e) => {
                        e.stopPropagation();
                        const ns = new Set(selectedIds);
                        if (e.target.checked) ns.add(r.id); else ns.delete(r.id);
                        setSelectedIds(ns);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      colorScheme="cyan"
                    />
                  </Flex>

                  {/* Login/User */}
                  <Text 
                    fontWeight="bold" 
                    color="white" 
                    fontSize="sm"
                    noOfLines={1}
                    mb={2}
                    title={r.login}
                  >
                    {r.login !== "-" ? r.login : r.serial}
                  </Text>

                  {/* Info Grid */}
                  <VStack spacing={1} align="stretch" fontSize="xs" color="whiteAlpha.700">
                    <HStack justify="space-between">
                      <Text>Fabricante</Text>
                      <Badge colorScheme={getManufacturerColor(r.fabricante)} size="sm">
                        {r.fabricante}
                      </Badge>
                    </HStack>
                    <HStack justify="space-between">
                      <Text>Modelo</Text>
                      <Text color="white" fontWeight="medium" noOfLines={1} maxW="120px">{r.modelo}</Text>
                    </HStack>
                    <HStack justify="space-between">
                      <Text>IP</Text>
                      <Text color="cyan.300" fontFamily="mono" fontSize="xs">{r.ip}</Text>
                    </HStack>
                    {r.ssid && r.ssid !== "-" && (
                      <HStack justify="space-between">
                        <HStack spacing={1}>
                          <Icon as={FiWifi} boxSize={3} />
                          <Text>SSID</Text>
                        </HStack>
                        <Text color="white" noOfLines={1} maxW="100px">{r.ssid}</Text>
                      </HStack>
                    )}
                  </VStack>

                  {/* Tag */}
                  {r.tag && (
                    <Tag size="sm" colorScheme="cyan" mt={3}>
                      <TagLabel>{r.tag}</TagLabel>
                    </Tag>
                  )}

                  {/* Actions */}
                  <Divider my={3} borderColor="whiteAlpha.100" />
                  <HStack spacing={2} justify="flex-end">
                    <Tooltip label="Atualizar">
                      <IconButton 
                        aria-label="Refresh" 
                        icon={<FiRefreshCw />} 
                        size="xs" 
                        variant="ghost"
                        onClick={(e) => { e.stopPropagation(); testarConectividade(r); }}
                      />
                    </Tooltip>
                    <Tooltip label="Reboot">
                      <IconButton 
                        aria-label="Reboot" 
                        icon={<FiPower />} 
                        size="xs" 
                        colorScheme="green"
                        variant="ghost"
                        onClick={(e) => { e.stopPropagation(); executarTask(r.id, "reboot"); }}
                      />
                    </Tooltip>
                    <Menu>
                      <MenuButton 
                        as={IconButton} 
                        aria-label="Mais" 
                        icon={<FiMoreVertical />} 
                        size="xs" 
                        variant="ghost"
                        onClick={(e) => e.stopPropagation()}
                      />
                      <MenuList bg="gray.700" borderColor="whiteAlpha.200" minW="150px">
                        <MenuItem 
                          icon={<FiEye />} 
                          onClick={(e) => { e.stopPropagation(); navigate(`/devices/${encodeURIComponent(r.id)}`); }}
                        >
                          Ver detalhes
                        </MenuItem>
                        <MenuItem 
                          icon={<FiTag />}
                          onClick={(e) => { e.stopPropagation(); abrirModalTag(r.id, r.tag); }}
                        >
                          Editar tag
                        </MenuItem>
                        <MenuItem 
                          icon={<FiUpload />}
                          onClick={(e) => { e.stopPropagation(); abrirModalPush(r.id); }}
                        >
                          Push File
                        </MenuItem>
                        <Divider />
                        <MenuItem 
                          icon={<FiTrash2 />} 
                          color="red.300"
                          onClick={(e) => { e.stopPropagation(); deleteDevice(r.id).then(() => fetchData()); }}
                        >
                          Deletar
                        </MenuItem>
                      </MenuList>
                    </Menu>
                  </HStack>
                </CardBody>
              </Card>
            ))}
          </SimpleGrid>
        ) : (
          /* TABLE VIEW */
          <Card bg="gray.800" border="1px solid" borderColor="whiteAlpha.100" overflow="hidden">
            <TableContainer maxH="65vh">
              <Table variant="simple" size="sm">
                <Thead position="sticky" top={0} zIndex={1} bg="gray.700">
                  <Tr>
                    <Th w="40px" borderColor="whiteAlpha.100">
                      <Checkbox
                        isChecked={pageData.length > 0 && pageData.every(r => selectedIds.has(r.id))}
                        isIndeterminate={pageData.some(r => selectedIds.has(r.id)) && !pageData.every(r => selectedIds.has(r.id))}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedIds(new Set(pageData.map(r => r.id)));
                          else setSelectedIds(new Set());
                        }}
                        colorScheme="cyan"
                      />
                    </Th>
                    <Th color="whiteAlpha.700" borderColor="whiteAlpha.100">Status</Th>
                    <Th color="whiteAlpha.700" borderColor="whiteAlpha.100">Login/Serial</Th>
                    <Th color="whiteAlpha.700" borderColor="whiteAlpha.100">Fabricante</Th>
                    <Th color="whiteAlpha.700" borderColor="whiteAlpha.100">Modelo</Th>
                    <Th color="whiteAlpha.700" borderColor="whiteAlpha.100">IP</Th>
                    <Th color="whiteAlpha.700" borderColor="whiteAlpha.100">SSID</Th>
                    <Th color="whiteAlpha.700" borderColor="whiteAlpha.100">Tipo</Th>
                    <Th color="whiteAlpha.700" borderColor="whiteAlpha.100">Último</Th>
                    <Th color="whiteAlpha.700" borderColor="whiteAlpha.100" w="120px">Ações</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {pageData.map((r) => (
                    <Tr 
                      key={r.id}
                      _hover={{ bg: "whiteAlpha.100" }}
                      cursor="pointer"
                      bg={r.online ? "transparent" : "whiteAlpha.50"}
                      onClick={() => navigate(`/devices/${encodeURIComponent(r.id)}`)}
                    >
                      <Td borderColor="whiteAlpha.100" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          isChecked={selectedIds.has(r.id)}
                          onChange={(e) => {
                            const ns = new Set(selectedIds);
                            if (e.target.checked) ns.add(r.id); else ns.delete(r.id);
                            setSelectedIds(ns);
                          }}
                          colorScheme="cyan"
                        />
                      </Td>
                      <Td borderColor="whiteAlpha.100">
                        <HStack spacing={2}>
                          <Box boxSize="10px" borderRadius="full" bg={r.online ? "green.400" : "red.500"} boxShadow={r.online ? "0 0 8px green" : "0 0 8px red"} />
                          <Text fontSize="xs" color={r.online ? "green.300" : "red.400"} fontWeight="bold">
                            {r.online ? "ONLINE" : "OFFLINE"}
                          </Text>
                        </HStack>
                      </Td>
                      <Td borderColor="whiteAlpha.100">
                        <VStack align="start" spacing={0}>
                          <Tooltip label={r.login !== "-" ? r.login : r.serial} placement="top" hasArrow bg="gray.700">
                            <Text color="cyan.200" fontWeight="bold" fontSize="sm" noOfLines={1} maxW="250px" cursor="help">
                              {r.login !== "-" ? r.login : r.serial}
                            </Text>
                          </Tooltip>
                          {r.login !== "-" && (
                            <Text color="gray.400" fontSize="xs">{r.serial}</Text>
                          )}
                        </VStack>
                      </Td>
                      <Td borderColor="whiteAlpha.100">
                        <Badge colorScheme={getManufacturerColor(r.fabricante)} variant="solid" fontSize="xs">
                          {r.fabricante}
                        </Badge>
                      </Td>
                      <Td borderColor="whiteAlpha.100">
                        <Tooltip label={r.modelo} placement="top" hasArrow bg="gray.700">
                          <Text color="white" fontSize="sm" noOfLines={1} maxW="180px" cursor="help">{r.modelo}</Text>
                        </Tooltip>
                      </Td>
                      <Td borderColor="whiteAlpha.100">
                        <Text color="yellow.300" fontFamily="mono" fontSize="sm" fontWeight="medium">{r.ip}</Text>
                      </Td>
                      <Td borderColor="whiteAlpha.100">
                        <Tooltip label={r.ssid} placement="top" hasArrow bg="gray.700">
                          <Text color="cyan.300" fontSize="sm" fontWeight="medium" noOfLines={1} maxW="180px" cursor="help">{r.ssid}</Text>
                        </Tooltip>
                      </Td>
                      <Td borderColor="whiteAlpha.100">
                        <Badge 
                          colorScheme={r.tipo === "ROUTER" ? "purple" : "orange"} 
                          variant="solid"
                          fontSize="xs"
                        >
                          {r.tipo}
                        </Badge>
                      </Td>
                      <Td borderColor="whiteAlpha.100">
                        <Text color="gray.300" fontSize="sm">{timeAgo(r.ultimo)}</Text>
                      </Td>
                      <Td borderColor="whiteAlpha.100" onClick={(e) => e.stopPropagation()}>
                        <HStack spacing={1}>
                          <Tooltip label="Ver detalhes">
                            <IconButton 
                              aria-label="Ver" 
                              icon={<FiEye />} 
                              size="sm" 
                              variant="solid"
                              colorScheme="cyan"
                              onClick={() => navigate(`/devices/${encodeURIComponent(r.id)}`)}
                            />
                          </Tooltip>
                          <Tooltip label="Atualizar">
                            <IconButton 
                              aria-label="Refresh" 
                              icon={<FiRefreshCw />} 
                              size="sm" 
                              variant="solid"
                              colorScheme="green"
                              onClick={() => testarConectividade(r)}
                            />
                          </Tooltip>
                          <Menu>
                            <MenuButton 
                              as={IconButton} 
                              aria-label="Mais" 
                              icon={<FiMoreVertical />} 
                              size="sm" 
                              variant="solid"
                              colorScheme="gray"
                            />
                            <MenuList bg="gray.700" borderColor="whiteAlpha.300" minW="160px">
                              <MenuItem icon={<FiPower />} _hover={{ bg: "green.600" }} onClick={() => executarTask(r.id, "reboot")}>
                                Reboot
                              </MenuItem>
                              <MenuItem icon={<FiTag />} _hover={{ bg: "blue.600" }} onClick={() => abrirModalTag(r.id, r.tag)}>
                                Tag
                              </MenuItem>
                              <MenuItem icon={<FiUpload />} _hover={{ bg: "purple.600" }} onClick={() => abrirModalPush(r.id)}>
                                Push File
                              </MenuItem>
                              <Divider borderColor="whiteAlpha.300" />
                              <MenuItem icon={<FiTrash2 />} color="red.400" _hover={{ bg: "red.600" }} onClick={() => deleteDevice(r.id).then(() => fetchData())}>
                                Deletar
                              </MenuItem>
                            </MenuList>
                          </Menu>
                        </HStack>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </TableContainer>
          </Card>
        )}

        {/* PAGINATION */}
        <Box 
          position="sticky" 
          bottom={0} 
          bg="gray.900" 
          pt={4} 
          pb={2}
          zIndex={5}
        >
          <Card bg="gray.800" border="2px solid" borderColor="cyan.600">
            <CardBody py={4}>
              <Flex 
                direction={{ base: "column", md: "row" }} 
                align="center" 
                justify="space-between"
                gap={4}
              >
                <HStack spacing={4}>
                  <Badge colorScheme="cyan" fontSize="md" px={3} py={1}>
                    {sorted.length} dispositivos
                  </Badge>
                  <Text color="white" fontSize="md" fontWeight="medium">
                    Mostrando <Text as="span" color="yellow.300" fontWeight="bold">{(page - 1) * pageSize + 1}</Text> - <Text as="span" color="yellow.300" fontWeight="bold">{Math.min(page * pageSize, sorted.length)}</Text>
                  </Text>
                </HStack>
                
                <HStack spacing={3}>
                  <ButtonGroup size="md" variant="solid" isAttached>
                    <Button 
                      colorScheme="gray" 
                      onClick={() => setPage(1)} 
                      isDisabled={page === 1}
                      leftIcon={<Text>⏮</Text>}
                    >
                      Início
                    </Button>
                    <Button 
                      colorScheme="gray" 
                      onClick={() => setPage(p => Math.max(1, p - 1))} 
                      isDisabled={page === 1}
                    >
                      ◀ Anterior
                    </Button>
                  </ButtonGroup>
                  
                  <HStack bg="cyan.600" px={4} py={2} borderRadius="md">
                    <Text color="white" fontWeight="bold" fontSize="lg">
                      {page}
                    </Text>
                    <Text color="whiteAlpha.700">/</Text>
                    <Text color="white" fontWeight="bold" fontSize="lg">
                      {totalPages}
                    </Text>
                  </HStack>
                  
                  <ButtonGroup size="md" variant="solid" isAttached>
                    <Button 
                      colorScheme="cyan" 
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))} 
                      isDisabled={page === totalPages}
                    >
                      Próxima ▶
                    </Button>
                    <Button 
                      colorScheme="gray" 
                      onClick={() => setPage(totalPages)} 
                      isDisabled={page === totalPages}
                      rightIcon={<Text>⏭</Text>}
                    >
                      Fim
                    </Button>
                  </ButtonGroup>
                </HStack>
              </Flex>
            </CardBody>
          </Card>
        </Box>
      </Box>

      {/* Modal Tag */}
      <Modal isOpen={isTagOpen} onClose={onTagClose} isCentered>
        <ModalOverlay bg="blackAlpha.700" />
        <ModalContent bg="gray.800" borderColor="whiteAlpha.200">
          <ModalHeader color="white">Gerenciar Tag</ModalHeader>
          <ModalBody>
            <VStack spacing={4} align="stretch">
              <Input 
                placeholder="Digite a tag/comentário" 
                value={tagValue} 
                onChange={(e) => setTagValue(e.target.value)}
                bg="whiteAlpha.50"
              />
              <Button onClick={enviarTag} colorScheme="cyan" isDisabled={!tagValue}>
                Salvar tag
              </Button>
              <Divider borderColor="whiteAlpha.200" />
              <Button 
                variant="outline" 
                colorScheme="red" 
                size="sm"
                onClick={() => { 
                  if (selectedDevice) removerTag(selectedDevice, tagValue || undefined); 
                  onTagClose(); 
                }}
              >
                Remover tag atual
              </Button>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button onClick={onTagClose} variant="ghost">Fechar</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Modal Push File */}
      <Modal isOpen={isPushOpen} onClose={onPushClose} isCentered>
        <ModalOverlay bg="blackAlpha.700" />
        <ModalContent bg="gray.800" borderColor="whiteAlpha.200">
          <ModalHeader color="white">Push File / Firmware</ModalHeader>
          <ModalBody>
            <VStack spacing={4} align="stretch">
              <Select 
                placeholder="Selecione um arquivo existente" 
                onChange={(e) => setSelectedFile(e.target.value)} 
                bg="whiteAlpha.50"
              >
                {files.map((f) => <option key={f} value={f}>{f}</option>)}
              </Select>
              <Text fontSize="sm" color="whiteAlpha.500">Ou envie um novo arquivo:</Text>
              <Input 
                type="file" 
                onChange={(e) => { if (e.target.files?.[0]) setUploadFileData(e.target.files[0]); }}
                p={1}
              />
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button colorScheme="cyan" mr={3} onClick={enviarPush}>Enviar</Button>
            <Button onClick={onPushClose} variant="ghost">Cancelar</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <style>{`
        :root { color-scheme: dark; }
        option { color: #000; background: #fff; }
      `}</style>
    </Box>
  );
}
