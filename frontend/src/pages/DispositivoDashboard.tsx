// src/pages/DispositivoDashboard.tsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  Box, SimpleGrid, useToast, Heading, HStack, Text, Icon, Badge, VStack, Divider,
  Tooltip, Tag, TagLabel, Tabs, TabList, TabPanels, Tab, TabPanel,
  Flex, Skeleton, Code, Button, IconButton, Input,
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter,
  ModalCloseButton, useDisclosure, FormControl, FormLabel, Select, Progress,
  Card, CardBody, CardHeader, Alert, AlertIcon,
  Menu, MenuButton, MenuList, MenuItem
} from "@chakra-ui/react";
import { useParams, useNavigate } from "react-router-dom";
import { getDeviceById, createTask } from "../services/genieAcsApi";
import { 
  FiWifi, FiSettings, FiActivity, FiServer, FiCpu, FiHardDrive, FiClock,
  FiRefreshCw, FiEdit2, FiSave, FiChevronDown, FiPower,
  FiGlobe, FiShield, FiUsers, FiZap, FiTerminal, FiCopy, FiArrowLeft
} from "react-icons/fi";
import { MdRouter, MdSettingsEthernet, MdSignalWifi4Bar, MdSignalWifi0Bar } from "react-icons/md";

import PingChart from "../components/PingChart";
import DiagnosticoStatus from "../components/DiagnosticoStatus";
import WifiConfigDualBand from "../components/WifiConfigDualBand";
import WifiTopology from "../components/WifiTopology";
import LanConfig from "../components/LanConfig";
import LanTopology from "../components/LanTopology";
import FirewallPortas from "../components/FirewallPortas";
import DispositivosConectados from "../components/DispositivosConectados";
import TesteConectividade from "../components/TesteConectividade";
import ClienteIXCEnhanced from "../components/ClienteIXCEnhanced";
import WanStatus from "../components/WanStatus";
import DeviceHistory from "../components/DeviceHistory";
import ParametersEditor from "../components/ParametersEditor";
import { GPONInfo } from "../components/GPONInfo";

// ================== HELPER FUNCTIONS ==================
function get(o: unknown, path: string, fb?: unknown): unknown {
  try {
    const raw = path.split(".").reduce((a: unknown, k: string) => {
      if (a && typeof a === 'object' && k in a) {
        return (a as Record<string, unknown>)[k];
      }
      return undefined;
    }, o);
    if (raw === undefined || raw === null) return fb;
    if (typeof raw === 'object' && raw !== null && '_value' in raw) {
      return (raw as Record<string, unknown>)._value ?? fb;
    }
    if (typeof raw === 'object') return raw;
    return raw ?? fb;
  } catch {
    return fb;
  }
}

// Busca em múltiplos caminhos TR-098 e TR-181
function getMulti(o: unknown, paths: string[], fb?: unknown): unknown {
  for (const path of paths) {
    const val = get(o, path, undefined);
    if (val !== undefined && val !== null && val !== "" && val !== "—") {
      return val;
    }
  }
  return fb;
}

function formatUptime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatBytes(bytes: number): string {
  if (!bytes || isNaN(bytes)) return "0 B";
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function timeAgo(date?: string | null): string {
  if (!date) return "—";
  const d = new Date(date).getTime();
  const diff = Math.max(0, Date.now() - d);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `${mins} min atrás`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h atrás`;
  const days = Math.floor(hours / 24);
  return `${days}d atrás`;
}

// ================== STAT CARD COMPONENT ==================
interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactElement;
  color?: string;
  helpText?: string;
  onClick?: () => void;
}

function StatCard({ label, value, icon, color = "cyan", helpText, onClick }: StatCardProps) {
  return (
    <Card 
      bg="gray.800" 
      border="1px solid" 
      borderColor="whiteAlpha.100"
      cursor={onClick ? "pointer" : "default"}
      onClick={onClick}
      _hover={onClick ? { borderColor: `${color}.500`, transform: "translateY(-2px)" } : {}}
      transition="all 0.2s"
    >
      <CardBody py={4}>
        <HStack justify="space-between">
          <Box>
            <Text fontSize="xs" color="whiteAlpha.600" textTransform="uppercase" fontWeight="bold">
              {label}
            </Text>
            <Text fontSize="xl" fontWeight="bold" color="white" mt={1}>
              {value}
            </Text>
            {helpText && (
              <Text fontSize="xs" color="whiteAlpha.500" mt={1}>{helpText}</Text>
            )}
          </Box>
          <Box p={3} bg={`${color}.500`} borderRadius="lg" opacity={0.8}>
            {icon}
          </Box>
        </HStack>
      </CardBody>
    </Card>
  );
}

// ================== INFO CARD COMPONENT ==================
interface InfoCardProps {
  title: string;
  icon?: React.ReactElement;
  children: React.ReactNode;
  actions?: React.ReactNode;
  borderColor?: string;
}

function InfoCard({ title, icon, children, actions, borderColor = "gray.600" }: InfoCardProps) {
  return (
    <Card bg="gray.800" border="2px solid" borderColor={borderColor} overflow="hidden" shadow="lg">
      <CardHeader bg="gray.750" bgGradient={`linear(to-r, gray.800, ${borderColor.replace('.500', '.900').replace('.600', '.900').replace('.400', '.900')})`} py={3} px={4} borderBottom="1px solid" borderColor="whiteAlpha.100">
        <Flex justify="space-between" align="center">
          <HStack spacing={3}>
            {icon && <Box color={borderColor.includes('gray') ? "cyan.400" : borderColor}>{icon}</Box>}
            <Heading size="sm" color="white">{title}</Heading>
          </HStack>
          {actions}
        </Flex>
      </CardHeader>
      <CardBody p={4}>
        {children}
      </CardBody>
    </Card>
  );
}

// ================== MAIN COMPONENT ==================
export default function DispositivoDashboard() {
  const { id: rawId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  
  // Decodifica o ID da URL
  const id = rawId ? decodeURIComponent(rawId) : undefined;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [device, setDevice] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal states
  const { isOpen: isWifiOpen, onOpen: onWifiOpen, onClose: onWifiClose } = useDisclosure();
  const { isOpen: isPPPOpen, onOpen: onPPPOpen, onClose: onPPPClose } = useDisclosure();
  const { isOpen: isInformOpen, onOpen: onInformOpen, onClose: onInformClose } = useDisclosure();

  // WiFi edit state
  const [wifiEdit, setWifiEdit] = useState({ ssid24: "", ssid5: "", pass24: "", pass5: "", channel24: "Auto", channel5: "Auto" });
  
  // Inform config state
  const [informInterval, setInformInterval] = useState(300);
  const [savingInform, setSavingInform] = useState(false);

  // Função de busca do dispositivo
  const fetchDevice = useCallback(async (deviceId: string, showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      setRefreshing(true);
      setError(null);
      
      console.log("[DispositivoDashboard] Buscando dispositivo:", deviceId);
      const data = await getDeviceById(deviceId);
      console.log("[DispositivoDashboard] Resposta da API:", data);
      
      const deviceData = data?.[0] ?? null;
      
      if (deviceData) {
        setDevice(deviceData);
        // Salva no cache
        try {
          localStorage.setItem(`semppre_device_${deviceId}`, JSON.stringify({ 
            data: deviceData, 
            timestamp: Date.now() 
          }));
        } catch { /* ignore storage errors */ }
      } else {
        console.warn("[DispositivoDashboard] Dispositivo não encontrado na resposta");
        setDevice(null);
        setError("Dispositivo não encontrado");
      }
    } catch (err) {
      console.error("[DispositivoDashboard] Erro ao carregar dispositivo:", err);
      setError(String(err));
      toast({ status: "error", title: "Erro ao carregar dispositivo" });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  // Carrega dispositivo quando ID muda
  useEffect(() => {
    // Sem ID, não faz nada
    if (!id) {
      setDevice(null);
      setLoading(false);
      setError("ID do dispositivo não fornecido");
      return;
    }
    
    // Flag para evitar race conditions
    let isCancelled = false;
    
    console.log("[DispositivoDashboard] Iniciando carregamento para ID:", id);
    
    // Inicia loading
    setLoading(true);
    setError(null);
    
    // Tenta carregar do cache primeiro
    const cacheKey = `semppre_device_${id}`;
    let cachedDevice = null;
    
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const { data, timestamp } = JSON.parse(cached);
        const cacheAge = Date.now() - timestamp;
        
        if (data && data._id && cacheAge < 60000) {
          console.log("[DispositivoDashboard] Cache encontrado (idade:", Math.round(cacheAge/1000), "s)");
          cachedDevice = data;
          
          // Mostra cache imediatamente
          if (!isCancelled) {
            setDevice(data);
            setLoading(false);
          }
          
          // Se cache é muito recente, não faz fetch
          if (cacheAge < 10000) {
            console.log("[DispositivoDashboard] Cache recente, pulando fetch");
            return;
          }
        } else {
          localStorage.removeItem(cacheKey);
        }
      }
    } catch { 
      localStorage.removeItem(cacheKey);
    }
    
    // Busca dados atualizados da API
    const loadFromApi = async () => {
      try {
        console.log("[DispositivoDashboard] Buscando da API:", id);
        const data = await getDeviceById(id);
        
        if (isCancelled) {
          console.log("[DispositivoDashboard] Request cancelado, ignorando resultado");
          return;
        }
        
        const deviceData = data?.[0] ?? null;
        
        if (deviceData) {
          console.log("[DispositivoDashboard] Dispositivo carregado:", deviceData._id);
          setDevice(deviceData);
          setError(null);
          
          // Atualiza cache
          try {
            localStorage.setItem(cacheKey, JSON.stringify({ 
              data: deviceData, 
              timestamp: Date.now() 
            }));
          } catch { /* ignore */ }
        } else if (!cachedDevice) {
          // Só mostra erro se não tinha cache
          console.warn("[DispositivoDashboard] Dispositivo não encontrado");
          setDevice(null);
          setError("Dispositivo não encontrado na API");
        }
      } catch (err) {
        if (isCancelled) return;
        
        console.error("[DispositivoDashboard] Erro na API:", err);
        if (!cachedDevice) {
          setError(String(err));
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    };
    
    loadFromApi();
    
    // Cleanup function
    return () => {
      isCancelled = true;
    };
  }, [id]);

  // Carrega configuração atual de Periodic Inform quando dispositivo carrega
  useEffect(() => {
    if (!device) return;
    
    const isTR181 = 'Device' in device;
    const currentInterval = isTR181
      ? (device as any).Device?.ManagementServer?.PeriodicInformInterval?._value
      : (device as any).InternetGatewayDevice?.ManagementServer?.PeriodicInformInterval?._value;
    
    const currentEnable = isTR181
      ? (device as any).Device?.ManagementServer?.PeriodicInformEnable?._value
      : (device as any).InternetGatewayDevice?.ManagementServer?.PeriodicInformEnable?._value;
    
    if (currentInterval) {
      setInformInterval(currentEnable === false ? 0 : Number(currentInterval));
    }
  }, [device]);

  // Função para refresh manual
  const handleRefreshDevice = useCallback(() => {
    if (id) {
      fetchDevice(id, false);
    }
  }, [id, fetchDevice]);

  // ================== EXTRACTED DATA ==================
  const devId = id ?? "—";
  const lastInform = device?._lastInform as string | undefined;
  const fabricante = (device?._deviceId as Record<string, string>)?._Manufacturer || "—";
  const modelo = (device?._deviceId as Record<string, string>)?._ProductClass || "—";
  const serial = (device?._deviceId as Record<string, string>)?._SerialNumber || "—";
  const tags = (device?._tags as string[]) || [];

  // Detectar se é ONU/ONT (possui interface óptica GPON)
  const isONU = useMemo(() => {
    const dev = device?.Device || {};
    return 'Optical' in dev || 'X_ZYXEL_GPON' in dev;
  }, [device]);

  // Device Info - TR-098 e TR-181
  // Device Info com fallback TR-181
  const firmware = String(getMulti(device, [
    "InternetGatewayDevice.DeviceInfo.SoftwareVersion",
    "InternetGatewayDevice.DeviceInfo.FirmwareVersion", 
    "Device.DeviceInfo.SoftwareVersion",
    "Device.DeviceInfo.FirmwareVersion"
  ], "—"));
  const uptime = Number(getMulti(device, [
    "InternetGatewayDevice.DeviceInfo.UpTime",
    "Device.DeviceInfo.UpTime"
  ], 0));
  const memTotal = Number(getMulti(device, [
    "InternetGatewayDevice.DeviceInfo.MemoryStatus.Total",
    "Device.DeviceInfo.MemoryStatus.Total"
  ], 0));
  const memFree = Number(getMulti(device, [
    "InternetGatewayDevice.DeviceInfo.MemoryStatus.Free",
    "Device.DeviceInfo.MemoryStatus.Free"
  ], 0));
  const cpuUsage = Number(getMulti(device, [
    "InternetGatewayDevice.DeviceInfo.ProcessStatus.CPUUsage",
    "Device.DeviceInfo.ProcessStatus.CPUUsage"
  ], 0));

  // WAN Connection - Multi-marca (TP-Link, Huawei, ZTE, D-Link)
  // ZTE usa índice 2 para PPP, outros usam 1
  const login = String(getMulti(device, [
    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Username",
    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.2.Username", // ZTE
    "Device.PPP.Interface.2.Username", // Zyxel TR-181
    "Device.PPP.Interface.1.Username"
  ], "")) || null;
  const pppPassword = String(getMulti(device, [
    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Password",
    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.2.Password", // ZTE
    "Device.PPP.Interface.2.Password", // Zyxel TR-181
    "Device.PPP.Interface.1.Password"
  ], ""));
  const connStatus = String(getMulti(device, [
    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.ConnectionStatus",
    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.2.ConnectionStatus", // ZTE
    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.ConnectionStatus", // D-Link/DHCP
    "Device.PPP.Interface.1.Status", // TP-Link EC220-G5 TR-181
    "Device.PPP.Interface.2.Status", // Zyxel TR-181
    "Device.IP.Interface.3.Status", // TP-Link/Zyxel TR-181
    "Device.IP.Interface.1.Status"
  ], "Disconnected"));
  const externalIP = String(getMulti(device, [
    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.ExternalIPAddress",
    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.2.ExternalIPAddress", // ZTE
    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.ExternalIPAddress", // D-Link/DHCP
    "Device.PPP.Interface.1.IPCP.LocalIPAddress", // TP-Link EC220-G5 TR-181
    "Device.PPP.Interface.2.IPCP.LocalIPAddress", // Zyxel TR-181
    "Device.IP.Interface.3.IPv4Address.1.IPAddress", // TP-Link/Zyxel TR-181 WAN
    "Device.IP.Interface.1.IPv4Address.1.IPAddress"
  ], ""));
  const gateway = String(getMulti(device, [
    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.DefaultGateway",
    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.2.DefaultGateway", // ZTE
    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.DefaultGateway", // D-Link/DHCP
    "InternetGatewayDevice.Layer3Forwarding.Forwarding.1.GatewayIPAddress", // ZTE alternativo
    "Device.Routing.Router.1.IPv4Forwarding.1.GatewayIPAddress",
    "Device.PPP.Interface.1.IPCP.RemoteIPAddress", // TP-Link EC220-G5 TR-181 gateway PPP
    "Device.PPP.Interface.2.IPCP.RemoteIPAddress" // Zyxel TR-181 gateway PPP
  ], "—"));
  const dns1 = String(getMulti(device, [
    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.DNSServers",
    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.2.DNSServers", // ZTE
    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.DNSServers", // D-Link/DHCP
    "Device.DNS.Client.Server.1.DNSServer",
    "Device.DHCPv4.Client.1.DNSServers" // Zyxel TR-181
  ], "—"));
  const macWan = String(getMulti(device, [
    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.MACAddress",
    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.2.MACAddress", // ZTE
    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.MACAddress", // D-Link/DHCP
    "InternetGatewayDevice.WANDevice.1.WANEthernetInterfaceConfig.MACAddress", // ZTE
    "Device.Ethernet.Interface.1.MACAddress",
    "Device.Ethernet.Interface.2.MACAddress" // Zyxel TR-181 WAN interface
  ], "—"));
  const mtu = String(getMulti(device, [
    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.MaxMTUSize",
    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.CurrentMRUSize",
    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.2.CurrentMRUSize", // ZTE
    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.MaxMTUSize", // D-Link/DHCP
    "Device.PPP.Interface.1.MaxMRUSize"
  ], "1500"));
  
  // Traffic stats - Multi-marca
  const bytesReceived = Number(getMulti(device, [
    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Stats.EthernetBytesReceived",
    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.2.Stats.EthernetBytesReceived", // ZTE
    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.Stats.EthernetBytesReceived", // D-Link
    "InternetGatewayDevice.WANDevice.1.WANCommonInterfaceConfig.TotalBytesReceived",
    "Device.IP.Interface.3.Stats.BytesReceived", // Zyxel TR-181
    "Device.IP.Interface.1.Stats.BytesReceived",
    "Device.Ethernet.Interface.1.Stats.BytesReceived" // TR-181 fallback
  ], 0));
  const bytesSent = Number(getMulti(device, [
    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Stats.EthernetBytesSent",
    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.2.Stats.EthernetBytesSent", // ZTE
    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.Stats.EthernetBytesSent", // D-Link
    "InternetGatewayDevice.WANDevice.1.WANCommonInterfaceConfig.TotalBytesSent",
    "Device.IP.Interface.3.Stats.BytesSent", // Zyxel TR-181
    "Device.IP.Interface.1.Stats.BytesSent",
    "Device.Ethernet.Interface.1.Stats.BytesSent" // TR-181 fallback
  ], 0));

  // ===== IPv6 - Multi-marca (TP-Link, Huawei, ZTE) =====
  const ipv6Enabled = Boolean(getMulti(device, [
    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.X_TP_IPv6Enabled", // TP-Link
    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.X_TP_IPv6Enabled", // TP-Link
    "InternetGatewayDevice.Services.X_HUAWEI_IPv6.Enable", // Huawei
    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.2.X_ZTE-COM_IPMode", // ZTE (Both = IPv4+IPv6)
    "Device.IP.Interface.1.IPv6Enable"
  ], false));
  const ipv4Enabled = Boolean(getMulti(device, [
    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.X_TP_IPv4Enabled",
    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Enable",
    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.2.Enable", // ZTE
    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.Enable", // D-Link
    "Device.IP.Interface.1.IPv4Enable"
  ], true));
  const ipv6Address = String(getMulti(device, [
    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.X_TP_ExternalIPv6Address", // TP-Link
    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.X_TP_ExternalIPv6Address", // TP-Link
    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.X_HUAWEI_IPv6Address", // Huawei
    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.2.X_ZTE-COM_ExternalIPv6Address", // ZTE
    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.2.X_ZTE-COM_LLA", // ZTE link-local
    "Device.PPP.Interface.2.IPV6CP.LocalInterfaceIdentifier", // Zyxel TR-181
    "Device.IP.Interface.3.IPv6Address.1.IPAddress", // Zyxel TR-181
    "Device.IP.Interface.1.IPv6Address.1.IPAddress"
  ], ""));
  const ipv6AddressingType = String(getMulti(device, [
    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.X_TP_IPv6AddressingType",
    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.X_TP_IPv6AddressingType",
    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.2.X_ZTE-COM_IPv6AcquireMode" // ZTE
  ], ""));
  const ipv6PrefixLength = String(getMulti(device, [
    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.X_TP_PrefixLength",
    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.X_TP_PrefixLength",
    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.2.X_ZTE-COM_PD", // ZTE Prefix Delegation
    "Device.IP.Interface.1.IPv6Prefix.1.Prefix"
  ], ""));
  const ipv6Gateway = String(getMulti(device, [
    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.X_TP_DefaultIPv6Gateway",
    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.X_TP_DefaultIPv6Gateway",
    "InternetGatewayDevice.Layer3Forwarding.X_ZTE-COM_IPv6Forwarding.9.NextHop", // ZTE default route
    "Device.Routing.Router.1.IPv6Forwarding.1.NextHop"
  ], ""));
  const ipv6DNS = String(getMulti(device, [
    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.X_TP_IPv6DNSServers", // TP-Link
    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.X_TP_IPv6DNSServers", // TP-Link
    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.2.X_ZTE-COM_IPv6DNSServers", // ZTE
    "InternetGatewayDevice.LANDevice.1.X_ZTE-COM_IPv6LANHostConfigManagement.DHCPv6.DNSAddress1", // ZTE LAN
    "Device.DNS.Client.Server.1.DNSServer"
  ], ""));
  
  // ===== DNS LAN (servidores distribuídos via DHCP) - Multi-marca =====
  const lanDNSServers = String(getMulti(device, [
    "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.DNSServers",
    "InternetGatewayDevice.LANDevice.1.X_ZTE-COM_IPv6LANHostConfigManagement.DHCPv6.DNSAddress1", // ZTE IPv6
    "Device.DHCPv4.Server.Pool.1.DNSServers"
  ], ""));
  const lanRemoteDns = String(getMulti(device, [
    "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.X_TP_RemoteDns",
    "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.X_ZTE-COM_ISPDNSEnable" // ZTE
  ], ""));
  const lanRemoteGw = String(getMulti(device, [
    "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.X_TP_RemoteGw"
  ], ""));
  const lanIpRouters = String(getMulti(device, [
    "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.IPRouters"
  ], ""));

  // WiFi - Multi-marca (TP-Link, Huawei, ZTE, D-Link)
  // Nota: Huawei/ZTE usam WLANConfiguration.1 para 2.4GHz e WLANConfiguration.5 para 5GHz
  // TP-Link usa WLANConfiguration.1 para 2.4GHz e WLANConfiguration.2 para 5GHz
  // SSID 2.4GHz
  const ssid24 = String(getMulti(device, [
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID",
    "Device.WiFi.SSID.1.SSID",
    "Device.WiFi.SSID.1.Alias" // Zyxel TR-181 alternativo
  ], "—"));
  // SSID 5GHz - multi-índice para diferentes marcas
  const ssid5 = String(getMulti(device, [
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.2.SSID", // TP-Link
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.SSID", // Huawei, ZTE
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.3.SSID", // Alguns D-Link
    "Device.WiFi.SSID.2.SSID",
    "Device.WiFi.SSID.3.SSID", // Zyxel TR-181 5GHz pode ser índice 3
    "Device.WiFi.SSID.5.SSID" // Zyxel TR-181 alternativo
  ], "—"));
  
  // Canais - Multi-marca
  const channel24 = String(getMulti(device, [
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.Channel",
    "Device.WiFi.Radio.1.Channel",
    "Device.WiFi.Radio.1.AutoChannelEnable" // Zyxel TR-181 Auto
  ], "Auto"));
  const channel5 = String(getMulti(device, [
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.2.Channel", // TP-Link
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.Channel", // Huawei, ZTE
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.3.Channel", // D-Link alternativo
    "Device.WiFi.Radio.2.Channel",
    "Device.WiFi.Radio.3.Channel" // Zyxel TR-181 alternativo
  ], "Auto"));
  
  // Radio Enabled - Multi-marca
  const radio24Enabled = Boolean(getMulti(device, [
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.Enable",
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.RadioEnabled",
    "Device.WiFi.Radio.1.Enable",
    "Device.WiFi.SSID.1.Enable" // Zyxel TR-181
  ], true));
  const radio5Enabled = Boolean(getMulti(device, [
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.2.Enable", // TP-Link
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.2.RadioEnabled",
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.Enable", // Huawei, ZTE
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.RadioEnabled",
    "Device.WiFi.Radio.2.Enable",
    "Device.WiFi.SSID.2.Enable", // Zyxel TR-181
    "Device.WiFi.SSID.3.Enable" // Zyxel TR-181 alternativo
  ], true));
  
  // Segurança - Multi-marca
  const security24 = String(getMulti(device, [
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.BeaconType",
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.WPAEncryptionModes",
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.IEEE11iEncryptionModes", // ZTE
    "Device.WiFi.AccessPoint.1.Security.ModeEnabled",
    "Device.WiFi.AccessPoint.1.Security.ModesSupported" // Zyxel TR-181
  ], "WPA2"));
  const security5 = String(getMulti(device, [
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.2.BeaconType", // TP-Link
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.2.WPAEncryptionModes",
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.BeaconType", // Huawei, ZTE
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.IEEE11iEncryptionModes", // ZTE
    "Device.WiFi.AccessPoint.2.Security.ModeEnabled",
    "Device.WiFi.AccessPoint.3.Security.ModeEnabled" // Zyxel TR-181 alternativo
  ], "WPA2"));
  
  // Senhas WiFi - Multi-marca
  const wifiPass24 = String(getMulti(device, [
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.PreSharedKey.1.PreSharedKey",
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.KeyPassphrase",
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.X_TP_PreSharedKey", // TP-Link
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.X_HUAWEI_WPAKey", // Huawei
    "Device.WiFi.AccessPoint.1.Security.KeyPassphrase",
    "Device.WiFi.AccessPoint.1.Security.PreSharedKey" // Zyxel TR-181
  ], ""));
  const wifiPass5 = String(getMulti(device, [
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.2.PreSharedKey.1.PreSharedKey", // TP-Link
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.2.KeyPassphrase",
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.PreSharedKey.1.PreSharedKey", // Huawei, ZTE
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.KeyPassphrase",
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.X_HUAWEI_WPAKey", // Huawei
    "Device.WiFi.AccessPoint.2.Security.KeyPassphrase",
    "Device.WiFi.AccessPoint.3.Security.KeyPassphrase", // Zyxel TR-181 alternativo
    "Device.WiFi.AccessPoint.2.Security.PreSharedKey" // Zyxel TR-181
  ], ""));
  
  // Clientes conectados - Multi-marca
  const connectedClients24 = Number(getMulti(device, [
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.TotalAssociations",
    "Device.WiFi.SSID.1.Stats.X_AssociatedDeviceNumberOfEntries",
    "Device.WiFi.AccessPoint.1.AssociatedDeviceNumberOfEntries" // Zyxel TR-181
  ], 0));
  const connectedClients5 = Number(getMulti(device, [
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.2.TotalAssociations", // TP-Link
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.TotalAssociations", // Huawei, ZTE
    "Device.WiFi.SSID.2.Stats.X_AssociatedDeviceNumberOfEntries",
    "Device.WiFi.AccessPoint.2.AssociatedDeviceNumberOfEntries", // Zyxel TR-181
    "Device.WiFi.AccessPoint.3.AssociatedDeviceNumberOfEntries" // Zyxel TR-181 alternativo
  ], 0));
  
  // Largura de banda WiFi - Multi-marca
  const bandwidth24 = String(getMulti(device, [
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.X_TP_Bandwidth", // TP-Link
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.X_ZTE-COM_BandWidth", // ZTE
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.OperatingChannelBandwidth",
    "Device.WiFi.Radio.1.OperatingChannelBandwidth",
    "Device.WiFi.Radio.1.CurrentOperatingChannelBandwidth" // Zyxel TR-181
  ], "20MHz"));
  const bandwidth5 = String(getMulti(device, [
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.2.X_TP_Bandwidth", // TP-Link
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.X_ZTE-COM_BandWidth", // ZTE
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.2.OperatingChannelBandwidth",
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.OperatingChannelBandwidth",
    "Device.WiFi.Radio.2.OperatingChannelBandwidth",
    "Device.WiFi.Radio.3.OperatingChannelBandwidth", // Zyxel TR-181 alternativo
    "Device.WiFi.Radio.2.CurrentOperatingChannelBandwidth" // Zyxel TR-181
  ], "80MHz"));
  
  // Standard WiFi - Multi-marca
  const standard24 = String(getMulti(device, [
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.Standard",
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.X_ZTE-COM_WlanStandard", // ZTE
    "Device.WiFi.Radio.1.OperatingStandards",
    "Device.WiFi.Radio.1.SupportedStandards" // Zyxel TR-181
  ], "802.11n"));
  const standard5 = String(getMulti(device, [
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.2.Standard", // TP-Link
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.Standard", // Huawei, ZTE
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.X_ZTE-COM_WlanStandard", // ZTE
    "Device.WiFi.Radio.2.OperatingStandards",
    "Device.WiFi.Radio.3.OperatingStandards", // Zyxel TR-181 alternativo
    "Device.WiFi.Radio.2.SupportedStandards" // Zyxel TR-181
  ], "802.11ac"));

  // LAN - Multi-marca
  const lanIP = String(getMulti(device, [
    "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.IPInterface.1.IPInterfaceIPAddress",
    "InternetGatewayDevice.LANDevice.1.LANEthernetInterfaceConfig.1.X_TP_IPAddress",
    "Device.IP.Interface.1.IPv4Address.1.IPAddress",
    "Device.IP.Interface.4.IPv4Address.1.IPAddress", // Zyxel TR-181 LAN interface
    "Device.IP.Interface.5.IPv4Address.1.IPAddress" // Zyxel TR-181 alternativo
  ], "192.168.1.1"));
  const lanMask = String(getMulti(device, [
    "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.IPInterface.1.IPInterfaceSubnetMask",
    "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.SubnetMask", // ZTE
    "Device.IP.Interface.1.IPv4Address.1.SubnetMask",
    "Device.IP.Interface.4.IPv4Address.1.SubnetMask", // Zyxel TR-181
    "Device.IP.Interface.5.IPv4Address.1.SubnetMask" // Zyxel TR-181 alternativo
  ], "255.255.255.0"));
  const lanMac = String(getMulti(device, [
    "InternetGatewayDevice.LANDevice.1.LANEthernetInterfaceConfig.1.MACAddress",
    "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.MACAddress", // ZTE
    "Device.Ethernet.Interface.1.MACAddress",
    "Device.Ethernet.Interface.5.MACAddress" // Zyxel TR-181
  ], "—"));
  const dhcpEnabled = Boolean(getMulti(device, [
    "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.DHCPServerEnable",
    "Device.DHCPv4.Server.Enable",
    "Device.DHCPv4.Server.Pool.1.Enable" // Zyxel TR-181
  ], true));
  const dhcpStart = String(getMulti(device, [
    "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.MinAddress",
    "Device.DHCPv4.Server.Pool.1.MinAddress",
    "Device.DHCPv4.Server.Pool.1.DNSServers" // Zyxel TR-181 se não tiver MinAddress
  ], "192.168.1.100"));
  const dhcpEnd = String(getMulti(device, [
    "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.MaxAddress",
    "Device.DHCPv4.Server.Pool.1.MaxAddress",
    "Device.DHCPv4.Server.Pool.1.Interface" // Zyxel TR-181 fallback
  ], "192.168.1.199"));
  const dhcpLeaseTime = String(getMulti(device, [
    "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.DHCPLeaseTime",
    "Device.DHCPv4.Server.Pool.1.LeaseTime",
    "Device.DHCPv4.Server.Pool.1.X_ZYXEL_DefaultLeaseTime" // Zyxel TR-181
  ], "86400"));
  
  // PON/GPON (para ONUs) - Multi-marca
  const ponSerial = String(getMulti(device, [
    "InternetGatewayDevice.WANDevice.1.X_GponInterafceConfig.PONSerial",
    "InternetGatewayDevice.WANDevice.1.GponInterfaceConfig.PONSerial",
    "Device.Optical.Interface.1.LowerLayers",
    "Device.Optical.Interface.1.Name", // Zyxel TR-181
    "Device.X_ZYXEL_PONStatus.PONSerial", // Zyxel specific
    "Device.DeviceInfo.SerialNumber" // Fallback genérico TR-181
  ], ""));
  const rxPower = String(getMulti(device, [
    "InternetGatewayDevice.WANDevice.1.X_GponInterafceConfig.RXPower",
    "InternetGatewayDevice.WANDevice.1.GponInterfaceConfig.RXPower",
    "Device.Optical.Interface.1.OpticalSignalLevel",
    "Device.Optical.Interface.1.RXPower", // Zyxel TR-181
    "Device.X_ZYXEL_PONStatus.RXPower", // Zyxel specific
    "Device.Optical.Interface.1.Stats.ReceivePower" // TR-181 genérico
  ], ""));
  const txPowerPon = String(getMulti(device, [
    "InternetGatewayDevice.WANDevice.1.X_GponInterafceConfig.TXPower",
    "InternetGatewayDevice.WANDevice.1.GponInterfaceConfig.TXPower",
    "Device.Optical.Interface.1.TransmitOpticalLevel",
    "Device.Optical.Interface.1.TXPower", // Zyxel TR-181
    "Device.X_ZYXEL_PONStatus.TXPower", // Zyxel specific
    "Device.Optical.Interface.1.Stats.TransmitPower" // TR-181 genérico
  ], ""));

  // Status calculations
  const isOnline = useMemo(() => {
    if (!lastInform) return false;
    return (Date.now() - new Date(lastInform).getTime()) / 60000 < 10;
  }, [lastInform]);

  const memUsagePercent = memTotal > 0 ? Math.round(((memTotal - memFree) / memTotal) * 100) : 0;

  const ident = useMemo(() => {
    if (login && tags.length > 0) return `${login} • ${tags[0]}`;
    if (login) return login;
    if (tags.length > 0) return tags[0];
    return serial || devId;
  }, [login, tags, serial, devId]);

  // Commands
  const handleReboot = async () => {
    if (!device?._id) return;
    try {
      await createTask(String(device._id), { name: "reboot" }, true);
      toast({ status: "success", title: "Comando de reboot enviado" });
    } catch {
      toast({ status: "error", title: "Erro ao enviar comando" });
    }
  };

  const handleFactoryReset = async () => {
    if (!device?._id) return;
    if (!window.confirm("Tem certeza que deseja fazer reset de fábrica? Todas as configurações serão perdidas.")) return;
    try {
      await createTask(String(device._id), { name: "factoryReset" }, true);
      toast({ status: "warning", title: "Reset de fábrica enviado" });
    } catch {
      toast({ status: "error", title: "Erro ao enviar comando" });
    }
  };

  const handleRefresh = async () => {
    if (!device?._id || !id) return;
    try {
      await createTask(String(device._id), { name: "refreshObject", objectName: "" }, true);
      toast({ status: "info", title: "Refresh solicitado" });
      setTimeout(() => fetchDevice(id, false), 3000);
    } catch {
      toast({ status: "error", title: "Erro ao solicitar refresh" });
    }
  };

  const handleSaveInform = async () => {
    if (!device?._id || !id) return;
    setSavingInform(true);
    try {
      const enable = informInterval > 0;
      const interval = informInterval || 86400;
      
      // Verifica se é TR-098 ou TR-181
      const isTR181 = 'Device' in device;
      const enablePath = isTR181 
        ? "Device.ManagementServer.PeriodicInformEnable" 
        : "InternetGatewayDevice.ManagementServer.PeriodicInformEnable";
      const intervalPath = isTR181 
        ? "Device.ManagementServer.PeriodicInformInterval" 
        : "InternetGatewayDevice.ManagementServer.PeriodicInformInterval";
      
      await createTask(String(device._id), {
        name: "setParameterValues",
        parameterValues: [
          [enablePath, String(enable), "xsd:boolean"],
          [intervalPath, String(interval), "xsd:unsignedInt"]
        ]
      }, true);
      
      toast({ 
        status: "success", 
        title: "Inform configurado", 
        description: `Interval: ${interval}s, Enabled: ${enable}` 
      });
      
      onInformClose();
      setTimeout(() => fetchDevice(id, false), 3000);
    } catch (err) {
      console.error("Erro ao salvar Inform:", err);
      toast({ status: "error", title: "Erro ao configurar Inform" });
    } finally {
      setSavingInform(false);
    }
  };

  // Copy to clipboard
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ status: "info", title: `${label} copiado`, duration: 2000 });
  };

  // ================== RENDER ==================
  
  // Tela de carregamento inicial
  if (loading && !device) {
    return (
      <Box minH="100vh" bg="gray.900" display="flex" alignItems="center" justifyContent="center">
        <VStack spacing={6}>
          <Box p={4} bg="cyan.500" borderRadius="full" boxShadow="0 0 30px cyan">
            <Icon as={MdRouter} boxSize={12} color="white" />
          </Box>
          <VStack spacing={2}>
            <Heading size="md" color="white">Carregando Dispositivo...</Heading>
            <Text color="whiteAlpha.600" fontSize="sm">ID: {id}</Text>
          </VStack>
          <HStack spacing={2}>
            <Skeleton height="8px" width="60px" borderRadius="full" />
            <Skeleton height="8px" width="80px" borderRadius="full" />
            <Skeleton height="8px" width="40px" borderRadius="full" />
          </HStack>
          <Button 
            variant="ghost" 
            colorScheme="cyan" 
            size="sm" 
            leftIcon={<FiArrowLeft />}
            onClick={() => navigate("/devices")}
          >
            Voltar para lista
          </Button>
        </VStack>
      </Box>
    );
  }

  // Tela de erro - dispositivo não encontrado
  if (!loading && !device) {
    return (
      <Box minH="100vh" bg="gray.900" display="flex" alignItems="center" justifyContent="center">
        <VStack spacing={6}>
          <Box p={4} bg="red.500" borderRadius="full" boxShadow="0 0 30px red">
            <Icon as={MdRouter} boxSize={12} color="white" />
          </Box>
          <VStack spacing={2}>
            <Heading size="md" color="white">Dispositivo não encontrado</Heading>
            <Text color="whiteAlpha.600" fontSize="sm">ID: {id}</Text>
            {error && (
              <Code bg="red.900" color="red.200" fontSize="xs" p={2} borderRadius="md">
                {error}
              </Code>
            )}
          </VStack>
          <Alert status="warning" bg="orange.900" borderRadius="md" maxW="450px">
            <AlertIcon />
            <Box>
              <Text fontSize="sm" fontWeight="bold">Possíveis causas:</Text>
              <Text fontSize="xs" mt={1}>• Dispositivo offline ou sem conexão</Text>
              <Text fontSize="xs">• ID do dispositivo incorreto</Text>
              <Text fontSize="xs">• Problema de conexão com o GenieACS</Text>
            </Box>
          </Alert>
          <HStack spacing={3}>
            <Button 
              colorScheme="cyan" 
              leftIcon={<FiRefreshCw />}
              onClick={() => id && fetchDevice(id, true)}
              isLoading={refreshing}
            >
              Tentar novamente
            </Button>
            <Button 
              variant="outline" 
              colorScheme="gray" 
              leftIcon={<FiArrowLeft />}
              onClick={() => navigate("/devices")}
            >
              Voltar para lista
            </Button>
          </HStack>
        </VStack>
      </Box>
    );
  }

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
        <Flex justify="space-between" align="center" flexWrap="wrap" gap={4}>
          <HStack spacing={4}>
            <IconButton
              aria-label="Voltar"
              icon={<FiArrowLeft />}
              variant="ghost"
              onClick={() => navigate("/devices")}
            />
            <Box 
              p={2} 
              bg={isOnline ? "green.500" : "red.500"} 
              borderRadius="lg"
              boxShadow={isOnline ? "0 0 15px green" : "0 0 15px red"}
            >
              <Icon as={MdRouter} boxSize={6} color="white" />
            </Box>
            <Box>
              {loading ? (
                <Skeleton height="28px" width="200px" />
              ) : (
                <Heading size="md" color="white">{ident}</Heading>
              )}
              <HStack spacing={2} mt={1}>
                <Badge colorScheme={isOnline ? "green" : "red"} variant="solid">
                  {isOnline ? "ONLINE" : "OFFLINE"}
                </Badge>
                <Badge colorScheme="purple" variant="outline">{fabricante}</Badge>
                <Badge colorScheme="blue" variant="outline">{modelo}</Badge>
              </HStack>
            </Box>
          </HStack>

          <HStack spacing={2}>
            <Tooltip label="Atualizar dados">
              <IconButton
                aria-label="Refresh"
                icon={<FiRefreshCw />}
                colorScheme="cyan"
                variant="ghost"
                isLoading={refreshing}
                onClick={handleRefreshDevice}
              />
            </Tooltip>
            <Tooltip label="Solicitar Inform">
              <IconButton
                aria-label="Inform"
                icon={<FiZap />}
                colorScheme="yellow"
                variant="ghost"
                onClick={handleRefresh}
              />
            </Tooltip>
            <Menu>
              <MenuButton as={Button} rightIcon={<FiChevronDown />} colorScheme="cyan" size="sm">
                Ações
              </MenuButton>
              <MenuList bg="gray.700" borderColor="whiteAlpha.200">
                <MenuItem icon={<FiSettings />} onClick={onInformOpen}>Configurar Inform Automático</MenuItem>
                <MenuItem icon={<FiPower />} onClick={handleReboot}>Reiniciar (Reboot)</MenuItem>
                <MenuItem icon={<FiSettings />} onClick={handleFactoryReset} color="red.300">Reset de Fábrica</MenuItem>
              </MenuList>
            </Menu>
          </HStack>
        </Flex>

        {/* Sub-header info */}
        <HStack spacing={6} mt={3} color="whiteAlpha.600" fontSize="sm" flexWrap="wrap">
          <HStack>
            <FiClock />
            <Text>Último Inform: {loading ? <Skeleton as="span" w="100px" h="14px" /> : timeAgo(lastInform)}</Text>
          </HStack>
          <HStack cursor="pointer" onClick={() => copyToClipboard(serial, "Serial")}>
            <Text>Serial:</Text>
            <Code bg="whiteAlpha.100" color="cyan.300">{serial}</Code>
            <FiCopy size={12} />
          </HStack>
          <HStack cursor="pointer" onClick={() => copyToClipboard(devId, "ID")}>
            <Text>ID:</Text>
            <Code bg="whiteAlpha.100" color="gray.400" fontSize="xs">{devId.substring(0, 30)}...</Code>
          </HStack>
          {tags.map(tag => (
            <Tag key={tag} colorScheme="cyan" size="sm">
              <TagLabel>{tag}</TagLabel>
            </Tag>
          ))}
        </HStack>
      </Box>

      <Box p={6}>
        {/* QUICK STATS */}
        <SimpleGrid columns={{ base: 2, md: 4, lg: 6 }} spacing={4} mb={6}>
          <StatCard
            label="Status"
            value={connStatus === "Connected" ? "Conectado" : "Desconectado"}
            icon={<FiGlobe />}
            color={connStatus === "Connected" ? "green" : "red"}
          />
          <StatCard
            label="IP Externo"
            value={externalIP || "—"}
            icon={<FiServer />}
            color="cyan"
            onClick={() => externalIP && copyToClipboard(externalIP, "IP")}
          />
          <StatCard
            label="Uptime"
            value={formatUptime(uptime)}
            icon={<FiClock />}
            color="purple"
          />
          <StatCard
            label="CPU"
            value={`${cpuUsage}%`}
            icon={<FiCpu />}
            color={cpuUsage > 80 ? "red" : cpuUsage > 50 ? "yellow" : "green"}
          />
          <StatCard
            label="Memória"
            value={`${memUsagePercent}%`}
            icon={<FiHardDrive />}
            color={memUsagePercent > 80 ? "red" : memUsagePercent > 50 ? "yellow" : "green"}
            helpText={memTotal > 0 ? `${formatBytes(memFree)} livre` : undefined}
          />
          <StatCard
            label="Clientes WiFi"
            value={connectedClients24 + connectedClients5}
            icon={<FiUsers />}
            color="blue"
            helpText={`2.4G: ${connectedClients24} • 5G: ${connectedClients5}`}
          />
        </SimpleGrid>

        <Tabs colorScheme="cyan" variant="enclosed-colored">
          <TabList bg="gray.800" border="1px solid" borderColor="whiteAlpha.100" rounded="lg" p={1} overflowX="auto">
            <Tab _selected={{ bg: "cyan.600", color: "white" }}>📊 Visão Geral</Tab>
            <Tab _selected={{ bg: "cyan.600", color: "white" }}>🌐 WAN / PPPoE</Tab>
            <Tab _selected={{ bg: "cyan.600", color: "white" }}>📶 Wi-Fi</Tab>
            <Tab _selected={{ bg: "cyan.600", color: "white" }}>🖧 LAN / DHCP</Tab>
            {isONU && <Tab _selected={{ bg: "orange.600", color: "white" }}>🔆 GPON / PON</Tab>}
            <Tab _selected={{ bg: "cyan.600", color: "white" }}>🔧 Diagnósticos</Tab>
            <Tab _selected={{ bg: "cyan.600", color: "white" }}>📋 Parâmetros</Tab>
            <Tab _selected={{ bg: "cyan.600", color: "white" }}>👤 Cliente IXC</Tab>
            <Tab _selected={{ bg: "cyan.600", color: "white" }}>📜 Histórico</Tab>
          </TabList>

          <TabPanels mt={4}>
            {/* ================== VISÃO GERAL ================== */}
            <TabPanel px={0}>
              <SimpleGrid columns={{ base: 1, lg: 3 }} spacing={6}>
                {/* Informações do Dispositivo */}
                <InfoCard 
                  title="Informações do Dispositivo" 
                  icon={<FiServer />}
                  actions={
                    <IconButton
                      aria-label="Refresh"
                      icon={<FiRefreshCw />}
                      size="xs"
                      variant="ghost"
                      onClick={handleRefresh}
                    />
                  }
                >
                  {loading ? (
                    <VStack spacing={3}>
                      {[1,2,3,4,5].map(i => <Skeleton key={i} h="32px" w="100%" />)}
                    </VStack>
                  ) : (
                    <VStack spacing={2} align="stretch">
                      <HStack justify="space-between" py={2} px={3} bg="whiteAlpha.50" rounded="md">
                        <Text color="gray.400" fontSize="sm">Fabricante</Text>
                        <Badge colorScheme="purple">{fabricante}</Badge>
                      </HStack>
                      <HStack justify="space-between" py={2} px={3} bg="whiteAlpha.50" rounded="md">
                        <Text color="gray.400" fontSize="sm">Modelo</Text>
                        <Text color="white" fontWeight="medium">{modelo}</Text>
                      </HStack>
                      <HStack justify="space-between" py={2} px={3} bg="whiteAlpha.50" rounded="md">
                        <Text color="gray.400" fontSize="sm">Serial</Text>
                        <HStack>
                          <Code bg="transparent" color="cyan.300">{serial}</Code>
                          <IconButton
                            aria-label="Copiar"
                            icon={<FiCopy />}
                            size="xs"
                            variant="ghost"
                            onClick={() => copyToClipboard(serial, "Serial")}
                          />
                        </HStack>
                      </HStack>
                      <HStack justify="space-between" py={2} px={3} bg="whiteAlpha.50" rounded="md">
                        <Text color="gray.400" fontSize="sm">Firmware</Text>
                        <Text color="white" fontWeight="medium">{firmware}</Text>
                      </HStack>
                      <HStack justify="space-between" py={2} px={3} bg="whiteAlpha.50" rounded="md">
                        <Text color="gray.400" fontSize="sm">Uptime</Text>
                        <Text color="green.300" fontWeight="medium">{formatUptime(uptime)}</Text>
                      </HStack>
                      
                      <Divider my={2} borderColor="whiteAlpha.200" />
                      
                      <Text fontSize="xs" color="whiteAlpha.500" fontWeight="bold" textTransform="uppercase">
                        Uso de Recursos
                      </Text>
                      <Box>
                        <HStack justify="space-between" mb={1}>
                          <Text fontSize="sm" color="gray.400">CPU</Text>
                          <Text fontSize="sm" color="white">{cpuUsage}%</Text>
                        </HStack>
                        <Progress 
                          value={cpuUsage} 
                          size="sm" 
                          colorScheme={cpuUsage > 80 ? "red" : cpuUsage > 50 ? "yellow" : "green"} 
                          borderRadius="full"
                        />
                      </Box>
                      <Box>
                        <HStack justify="space-between" mb={1}>
                          <Text fontSize="sm" color="gray.400">Memória</Text>
                          <Text fontSize="sm" color="white">{memUsagePercent}%</Text>
                        </HStack>
                        <Progress 
                          value={memUsagePercent} 
                          size="sm" 
                          colorScheme={memUsagePercent > 80 ? "red" : memUsagePercent > 50 ? "yellow" : "green"} 
                          borderRadius="full"
                        />
                      </Box>
                    </VStack>
                  )}
                </InfoCard>

                {/* Conexão WAN */}
                <InfoCard 
                  title="Conexão WAN" 
                  icon={<FiGlobe />}
                  borderColor={connStatus === "Connected" ? "green.500" : "red.500"}
                  actions={
                    <Badge colorScheme={connStatus === "Connected" ? "green" : "red"}>
                      {connStatus === "Connected" ? "Conectado" : "Desconectado"}
                    </Badge>
                  }
                >
                  {loading ? (
                    <VStack spacing={3}>
                      {[1,2,3,4].map(i => <Skeleton key={i} h="32px" w="100%" />)}
                    </VStack>
                  ) : (
                    <VStack spacing={2} align="stretch">
                      <HStack justify="space-between" py={2} px={3} bg="whiteAlpha.50" rounded="md">
                        <Text color="gray.400" fontSize="sm">IP Externo</Text>
                        <HStack>
                          <Text color="yellow.300" fontWeight="bold" fontFamily="mono">{externalIP || "—"}</Text>
                          {externalIP && (
                            <IconButton
                              aria-label="Copiar"
                              icon={<FiCopy />}
                              size="xs"
                              variant="ghost"
                              onClick={() => copyToClipboard(externalIP, "IP")}
                            />
                          )}
                        </HStack>
                      </HStack>
                      <HStack justify="space-between" py={2} px={3} bg="whiteAlpha.50" rounded="md">
                        <Text color="gray.400" fontSize="sm">Gateway</Text>
                        <Text color="white" fontFamily="mono">{gateway}</Text>
                      </HStack>
                      <HStack justify="space-between" py={2} px={3} bg="whiteAlpha.50" rounded="md">
                        <Text color="gray.400" fontSize="sm">DNS</Text>
                        <Text color="white" fontFamily="mono" fontSize="xs">{dns1}</Text>
                      </HStack>
                      <HStack justify="space-between" py={2} px={3} bg="whiteAlpha.50" rounded="md">
                        <Text color="gray.400" fontSize="sm">Login PPPoE</Text>
                        <Text color="cyan.300" fontWeight="medium">{login || "—"}</Text>
                      </HStack>
                      
                      <Divider my={2} borderColor="whiteAlpha.200" />
                      
                      <Text fontSize="xs" color="whiteAlpha.600" fontWeight="bold" textTransform="uppercase">
                        Tráfego
                      </Text>
                      <SimpleGrid columns={2} spacing={2}>
                        <Box bg="green.900" p={3} rounded="md" textAlign="center" border="1px solid" borderColor="green.700">
                          <Text fontSize="xs" color="green.200" fontWeight="semibold">⬇ Download</Text>
                          <Text color="white" fontWeight="bold">{formatBytes(bytesReceived)}</Text>
                        </Box>
                        <Box bg="blue.900" p={3} rounded="md" textAlign="center" border="1px solid" borderColor="blue.700">
                          <Text fontSize="xs" color="blue.200" fontWeight="semibold">⬆ Upload</Text>
                          <Text color="white" fontWeight="bold">{formatBytes(bytesSent)}</Text>
                        </Box>
                      </SimpleGrid>
                    </VStack>
                  )}
                </InfoCard>

                {/* Ping em Tempo Real */}
                <InfoCard title="Ping em Tempo Real" icon={<FiActivity />}>
                  <PingChart 
                    host={externalIP && externalIP !== "—" ? externalIP : undefined} 
                    fallbackHosts={["8.8.8.8", "1.1.1.1"]} 
                  />
                </InfoCard>
              </SimpleGrid>

              {/* WiFi Cards - Simplificado */}
              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={6} mt={6}>
                <InfoCard 
                  title="Wi-Fi 2.4 GHz" 
                  icon={<Icon as={radio24Enabled ? MdSignalWifi4Bar : MdSignalWifi0Bar} />}
                  borderColor={radio24Enabled ? "green.400" : "gray.600"}
                  actions={
                    <HStack>
                      <Badge colorScheme={radio24Enabled ? "green" : "gray"} variant="solid">
                        {radio24Enabled ? "ATIVO" : "OFF"}
                      </Badge>
                      <Badge colorScheme="cyan" variant="solid">{connectedClients24} 👤</Badge>
                    </HStack>
                  }
                >
                  <VStack spacing={3} align="stretch">
                    <Box bg="green.900" p={3} rounded="lg" border="2px solid" borderColor="green.500">
                      <Text color="green.400" fontSize="xs" fontWeight="bold" mb={1}>SSID</Text>
                      <Text color="white" fontWeight="bold" fontSize="lg">{ssid24}</Text>
                    </Box>
                    <SimpleGrid columns={2} spacing={2}>
                      <Box bg="yellow.800" p={2} rounded="md">
                        <Text color="yellow.200" fontSize="xs" fontWeight="semibold">Canal</Text>
                        <Text color="white" fontWeight="bold">{channel24}</Text>
                      </Box>
                      <Box bg="cyan.800" p={2} rounded="md">
                        <Text color="cyan.200" fontSize="xs" fontWeight="semibold">Banda</Text>
                        <Text color="white" fontWeight="bold">{bandwidth24}</Text>
                      </Box>
                      <Box bg="orange.800" p={2} rounded="md">
                        <Text color="orange.200" fontSize="xs" fontWeight="semibold">Padrão</Text>
                        <Text color="white" fontWeight="bold">{standard24}</Text>
                      </Box>
                      <Box bg="teal.800" p={2} rounded="md">
                        <Text color="teal.200" fontSize="xs" fontWeight="semibold">Segurança</Text>
                        <Text color="white" fontWeight="bold">{security24}</Text>
                      </Box>
                    </SimpleGrid>
                    <Box bg="blue.900" p={3} rounded="lg" border="1px solid" borderColor="blue.600">
                      <HStack justify="space-between">
                        <Box>
                          <Text color="blue.300" fontSize="xs" fontWeight="bold">SENHA</Text>
                          <Text color="white" fontFamily="mono">••••••••</Text>
                        </Box>
                        {wifiPass24 && (
                          <IconButton
                            aria-label="Copiar senha"
                            icon={<FiCopy />}
                            size="sm"
                            colorScheme="blue"
                            onClick={() => copyToClipboard(wifiPass24, "Senha WiFi 2.4GHz")}
                          />
                        )}
                      </HStack>
                    </Box>
                  </VStack>
                </InfoCard>

                <InfoCard 
                  title="Wi-Fi 5 GHz" 
                  icon={<Icon as={radio5Enabled ? MdSignalWifi4Bar : MdSignalWifi0Bar} />}
                  borderColor={radio5Enabled ? "purple.400" : "gray.600"}
                  actions={
                    <HStack>
                      <Badge colorScheme={radio5Enabled ? "purple" : "gray"} variant="solid">
                        {radio5Enabled ? "ATIVO" : "OFF"}
                      </Badge>
                      <Badge colorScheme="cyan" variant="solid">{connectedClients5} 👤</Badge>
                    </HStack>
                  }
                >
                  <VStack spacing={3} align="stretch">
                    <Box bg="purple.900" p={3} rounded="lg" border="2px solid" borderColor="purple.500">
                      <Text color="purple.400" fontSize="xs" fontWeight="bold" mb={1}>SSID</Text>
                      <Text color="white" fontWeight="bold" fontSize="lg">{ssid5}</Text>
                    </Box>
                    <SimpleGrid columns={2} spacing={2}>
                      <Box bg="yellow.800" p={2} rounded="md">
                        <Text color="yellow.200" fontSize="xs" fontWeight="semibold">Canal</Text>
                        <Text color="white" fontWeight="bold">{channel5}</Text>
                      </Box>
                      <Box bg="cyan.800" p={2} rounded="md">
                        <Text color="cyan.200" fontSize="xs" fontWeight="semibold">Banda</Text>
                        <Text color="white" fontWeight="bold">{bandwidth5}</Text>
                      </Box>
                      <Box bg="orange.800" p={2} rounded="md">
                        <Text color="orange.200" fontSize="xs" fontWeight="semibold">Padrão</Text>
                        <Text color="white" fontWeight="bold">{standard5}</Text>
                      </Box>
                      <Box bg="teal.800" p={2} rounded="md">
                        <Text color="teal.200" fontSize="xs" fontWeight="semibold">Segurança</Text>
                        <Text color="white" fontWeight="bold">{security5}</Text>
                      </Box>
                    </SimpleGrid>
                    <Box bg="blue.900" p={3} rounded="lg" border="1px solid" borderColor="blue.600">
                      <HStack justify="space-between">
                        <Box>
                          <Text color="blue.300" fontSize="xs" fontWeight="bold">SENHA</Text>
                          <Text color="white" fontFamily="mono">••••••••</Text>
                        </Box>
                        {wifiPass5 && (
                          <IconButton
                            aria-label="Copiar senha"
                            icon={<FiCopy />}
                            size="sm"
                            colorScheme="blue"
                            onClick={() => copyToClipboard(wifiPass5, "Senha WiFi 5GHz")}
                          />
                        )}
                      </HStack>
                    </Box>
                  </VStack>
                </InfoCard>
              </SimpleGrid>

              {/* IPv6 Card */}
              {(ipv6Enabled || ipv6Address) && (
                <SimpleGrid columns={{ base: 1 }} spacing={6} mt={6}>
                  <InfoCard 
                    title="IPv6" 
                    icon={<FiGlobe />}
                    borderColor={ipv6Enabled ? "teal.500" : "gray.600"}
                    actions={
                      <HStack spacing={2}>
                        <Badge colorScheme={ipv6Enabled ? "teal" : "gray"} variant="solid">
                          IPv6 {ipv6Enabled ? "✓" : "✗"}
                        </Badge>
                        <Badge colorScheme={ipv4Enabled ? "blue" : "gray"} variant="solid">
                          IPv4 {ipv4Enabled ? "✓" : "✗"}
                        </Badge>
                        {ipv6AddressingType && (
                          <Badge colorScheme="purple" variant="outline">{ipv6AddressingType}</Badge>
                        )}
                      </HStack>
                    }
                  >
                    <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                      <VStack spacing={2} align="stretch">
                        <Box py={3} px={3} bg="teal.900" rounded="md" border="2px solid" borderColor="teal.600">
                          <Text color="teal.200" fontSize="xs" fontWeight="semibold">Endereço IPv6</Text>
                          <HStack mt={1}>
                            <Text color="white" fontSize="sm" fontFamily="mono" fontWeight="bold">{ipv6Address || "—"}</Text>
                            {ipv6Address && (
                              <IconButton
                                aria-label="Copiar"
                                icon={<FiCopy />}
                                size="xs"
                                variant="ghost"
                                onClick={() => copyToClipboard(ipv6Address, "IPv6")}
                              />
                            )}
                          </HStack>
                        </Box>
                        <Box py={3} px={3} bg="gray.700" rounded="md" border="1px solid" borderColor="gray.600">
                          <Text color="gray.300" fontSize="xs" fontWeight="semibold">Tamanho do Prefixo</Text>
                          <Text color="white" fontSize="sm" fontFamily="mono" mt={1}>/{ipv6PrefixLength || "—"}</Text>
                        </Box>
                      </VStack>
                      <VStack spacing={2} align="stretch">
                        <Box py={3} px={3} bg="gray.700" rounded="md" border="1px solid" borderColor="gray.600">
                          <Text color="gray.300" fontSize="xs" fontWeight="semibold">Gateway IPv6</Text>
                          <Text color="white" fontSize="xs" fontFamily="mono" mt={1} wordBreak="break-all">{ipv6Gateway || "—"}</Text>
                        </Box>
                        <Box py={3} px={3} bg="cyan.900" rounded="md" border="1px solid" borderColor="cyan.600">
                          <Text color="cyan.200" fontSize="xs" fontWeight="semibold">DNS IPv6</Text>
                          <Text color="white" fontSize="xs" fontFamily="mono" mt={1} wordBreak="break-all">{ipv6DNS || "—"}</Text>
                        </Box>
                      </VStack>
                    </SimpleGrid>
                  </InfoCard>
                </SimpleGrid>
              )}

              {/* PON/GPON Card - para ONUs */}
              {(ponSerial || rxPower) && (
                <SimpleGrid columns={{ base: 1 }} spacing={6} mt={6}>
                  <InfoCard 
                    title="PON / GPON" 
                    icon={<FiZap />}
                    borderColor="orange.500"
                  >
                    <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
                      <Box bg="orange.900" p={4} rounded="md" border="2px solid" borderColor="orange.600">
                        <Text fontSize="xs" color="orange.200" fontWeight="semibold">Serial PON</Text>
                        <Text color="white" fontFamily="mono" fontWeight="bold" mt={1}>{ponSerial || "—"}</Text>
                      </Box>
                      <Box bg="green.900" p={4} rounded="md" border="2px solid" borderColor="green.600">
                        <Text fontSize="xs" color="green.200" fontWeight="semibold">RX Power</Text>
                        <Text color="white" fontWeight="bold" fontSize="lg" mt={1}>{rxPower || "—"} dBm</Text>
                      </Box>
                      <Box bg="blue.900" p={4} rounded="md" border="2px solid" borderColor="blue.600">
                        <Text fontSize="xs" color="blue.200" fontWeight="semibold">TX Power</Text>
                        <Text color="white" fontWeight="bold" fontSize="lg" mt={1}>{txPowerPon || "—"} dBm</Text>
                      </Box>
                    </SimpleGrid>
                  </InfoCard>
                </SimpleGrid>
              )}
            </TabPanel>

            {/* ================== WAN / PPPoE ================== */}
            <TabPanel px={0}>
              <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={6}>
                <InfoCard 
                  title="Configuração WAN" 
                  icon={<FiGlobe />}
                  borderColor={connStatus === "Connected" ? "green.500" : "red.500"}
                  actions={
                    <Button size="sm" colorScheme="cyan" leftIcon={<FiEdit2 />} onClick={onPPPOpen}>
                      Editar PPPoE
                    </Button>
                  }
                >
                  <VStack spacing={2} align="stretch">
                    <HStack justify="space-between" py={2} px={3} bg={connStatus === "Connected" ? "green.900" : "red.900"} rounded="md" border="1px solid" borderColor={connStatus === "Connected" ? "green.700" : "red.700"}>
                      <Text color={connStatus === "Connected" ? "green.300" : "red.300"} fontSize="sm" fontWeight="bold">Status</Text>
                      <Badge colorScheme={connStatus === "Connected" ? "green" : "red"} variant="solid">
                        {connStatus === "Connected" ? "CONECTADO" : "DESCONECTADO"}
                      </Badge>
                    </HStack>
                    <HStack justify="space-between" py={2} px={3} bg="yellow.900" rounded="md" border="1px solid" borderColor="yellow.700">
                      <Text color="yellow.300" fontSize="sm" fontWeight="bold">IP Externo (IPv4)</Text>
                      <HStack>
                        <Text color="white" fontWeight="bold" fontFamily="mono" fontSize="lg">{externalIP || "—"}</Text>
                        {externalIP && (
                          <IconButton
                            aria-label="Copiar"
                            icon={<FiCopy />}
                            size="xs"
                            variant="solid"
                            colorScheme="yellow"
                            onClick={() => copyToClipboard(externalIP, "IP")}
                          />
                        )}
                      </HStack>
                    </HStack>
                    <HStack justify="space-between" py={2} px={3} bg="whiteAlpha.50" rounded="md">
                      <Text color="gray.400" fontSize="sm">Gateway</Text>
                      <Text color="white" fontFamily="mono">{gateway}</Text>
                    </HStack>
                    <HStack justify="space-between" py={2} px={3} bg="whiteAlpha.50" rounded="md">
                      <Text color="gray.400" fontSize="sm">DNS</Text>
                      <Text color="cyan.300" fontFamily="mono" fontSize="xs">{dns1}</Text>
                    </HStack>
                    <HStack justify="space-between" py={2} px={3} bg="blue.900" rounded="md" border="1px solid" borderColor="blue.700">
                      <Text color="blue.300" fontSize="sm" fontWeight="bold">Login PPPoE</Text>
                      <Text color="white" fontWeight="medium">{login || "—"}</Text>
                    </HStack>
                    <HStack justify="space-between" py={2} px={3} bg="whiteAlpha.50" rounded="md">
                      <Text color="gray.400" fontSize="sm">MAC WAN</Text>
                      <Code bg="transparent" color="cyan.300" fontSize="xs">{macWan}</Code>
                    </HStack>
                    <HStack justify="space-between" py={2} px={3} bg="whiteAlpha.50" rounded="md">
                      <Text color="gray.400" fontSize="sm">MTU</Text>
                      <Badge colorScheme="purple">{mtu}</Badge>
                    </HStack>
                  </VStack>
                  
                  {/* IPv6 Section */}
                  {(ipv6Enabled || ipv6Address) && (
                    <>
                      <Divider my={4} borderColor="whiteAlpha.200" />
                      <Text fontSize="xs" color="teal.400" fontWeight="bold" textTransform="uppercase" mb={2}>
                        IPv6
                      </Text>
                      <VStack spacing={2} align="stretch">
                        <HStack justify="space-between" py={2} px={3} bg={ipv6Enabled ? "teal.900" : "gray.700"} rounded="md" border="1px solid" borderColor={ipv6Enabled ? "teal.700" : "gray.600"}>
                          <Text color={ipv6Enabled ? "teal.300" : "gray.400"} fontSize="sm">Status IPv6</Text>
                          <Badge colorScheme={ipv6Enabled ? "teal" : "gray"} variant="solid">
                            {ipv6Enabled ? "HABILITADO" : "DESABILITADO"}
                          </Badge>
                        </HStack>
                        {ipv6Address && (
                          <HStack justify="space-between" py={2} px={3} bg="whiteAlpha.50" rounded="md">
                            <Text color="gray.400" fontSize="sm">Endereço IPv6</Text>
                            <Text color="teal.300" fontFamily="mono" fontSize="xs">{ipv6Address}</Text>
                          </HStack>
                        )}
                        {ipv6Gateway && (
                          <HStack justify="space-between" py={2} px={3} bg="whiteAlpha.50" rounded="md">
                            <Text color="gray.400" fontSize="sm">Gateway IPv6</Text>
                            <Text color="white" fontFamily="mono" fontSize="xs">{ipv6Gateway}</Text>
                          </HStack>
                        )}
                      </VStack>
                    </>
                  )}
                  
                  <Divider my={4} borderColor="whiteAlpha.200" />
                  <WanStatus device={device} />
                </InfoCard>

                <InfoCard title="Tráfego de Rede" icon={<FiActivity />} borderColor="purple.500">
                  <VStack spacing={4} align="stretch">
                    <Box bg="green.900" p={4} rounded="lg" border="2px solid" borderColor="green.600">
                      <HStack justify="space-between" mb={2}>
                        <Text color="green.200" fontWeight="bold">⬇ Download Total</Text>
                        <Text color="white" fontSize="2xl" fontWeight="bold">{formatBytes(bytesReceived)}</Text>
                      </HStack>
                      <Progress value={50} colorScheme="green" size="sm" borderRadius="full" bg="green.800" />
                    </Box>
                    <Box bg="blue.900" p={4} rounded="lg" border="2px solid" borderColor="blue.600">
                      <HStack justify="space-between" mb={2}>
                        <Text color="blue.200" fontWeight="bold">⬆ Upload Total</Text>
                        <Text color="white" fontSize="2xl" fontWeight="bold">{formatBytes(bytesSent)}</Text>
                      </HStack>
                      <Progress value={30} colorScheme="blue" size="sm" borderRadius="full" bg="blue.800" />
                    </Box>
                    
                    <Divider borderColor="whiteAlpha.200" />
                    
                    <SimpleGrid columns={2} spacing={3}>
                      <Box bg="purple.900" p={3} rounded="md" border="2px solid" borderColor="purple.600">
                        <Text fontSize="xs" color="purple.200" fontWeight="semibold">MTU</Text>
                        <Text color="white" fontWeight="bold" fontSize="lg">{mtu}</Text>
                      </Box>
                      <Box bg="cyan.900" p={3} rounded="md" border="2px solid" borderColor="cyan.600">
                        <Text fontSize="xs" color="cyan.200" fontWeight="semibold">MAC WAN</Text>
                        <Text color="white" fontWeight="bold" fontSize="xs">{macWan}</Text>
                      </Box>
                    </SimpleGrid>
                    
                    {/* PON Stats se disponível */}
                    {(rxPower || txPowerPon) && (
                      <>
                        <Divider borderColor="whiteAlpha.200" />
                        <Text fontSize="xs" color="orange.300" fontWeight="bold" textTransform="uppercase">
                          Sinal Óptico (PON)
                        </Text>
                        <SimpleGrid columns={2} spacing={3}>
                          <Box bg="green.900" p={3} rounded="md" border="2px solid" borderColor="green.600">
                            <Text fontSize="xs" color="green.200" fontWeight="semibold">RX Power</Text>
                            <Text color="white" fontWeight="bold" fontSize="lg">{rxPower || "—"} dBm</Text>
                          </Box>
                          <Box bg="orange.900" p={3} rounded="md" border="2px solid" borderColor="orange.600">
                            <Text fontSize="xs" color="orange.200" fontWeight="semibold">TX Power</Text>
                            <Text color="white" fontWeight="bold" fontSize="lg">{txPowerPon || "—"} dBm</Text>
                          </Box>
                        </SimpleGrid>
                      </>
                    )}
                  </VStack>
                </InfoCard>
              </SimpleGrid>
            </TabPanel>

            {/* ================== WI-FI ================== */}
            <TabPanel px={0}>
              <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={6}>
                <InfoCard 
                  title="Configuração Wi-Fi" 
                  icon={<FiWifi />}
                  borderColor="green.500"
                  actions={
                    <Button size="sm" colorScheme="green" leftIcon={<FiEdit2 />} onClick={onWifiOpen}>
                      Editar Wi-Fi
                    </Button>
                  }
                >
                  <WifiConfigDualBand device={device} deviceId={device?._id ? String(device._id) : ""} />
                </InfoCard>

                <InfoCard title="Topologia Wi-Fi" icon={<FiUsers />} borderColor="purple.500">
                  <WifiTopology device={device} />
                </InfoCard>
              </SimpleGrid>
            </TabPanel>

            {/* ================== LAN / DHCP ================== */}
            <TabPanel px={0}>
              <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={6}>
                <InfoCard 
                  title="Configuração LAN" 
                  icon={<MdSettingsEthernet />}
                  borderColor="yellow.500"
                >
                  <VStack spacing={3} align="stretch">
                    {/* IP Principal */}
                    <Box bg="yellow.900" p={4} rounded="lg" border="2px solid" borderColor="yellow.500">
                      <Text color="yellow.400" fontSize="xs" fontWeight="bold" mb={1}>IP DO ROTEADOR</Text>
                      <Text color="white" fontWeight="bold" fontFamily="mono" fontSize="2xl">{lanIP}</Text>
                    </Box>
                    
                    <SimpleGrid columns={2} spacing={3}>
                      <Box bg="cyan.900" p={3} rounded="md" border="1px solid" borderColor="cyan.700">
                        <Text color="cyan.300" fontSize="xs" fontWeight="semibold">Máscara</Text>
                        <Text color="white" fontWeight="bold" fontFamily="mono">{lanMask}</Text>
                      </Box>
                      <Box bg="purple.900" p={3} rounded="md" border="1px solid" borderColor="purple.700">
                        <Text color="purple.300" fontSize="xs" fontWeight="semibold">MAC LAN</Text>
                        <Text color="white" fontWeight="bold" fontSize="xs" fontFamily="mono">{lanMac}</Text>
                      </Box>
                    </SimpleGrid>
                    
                    <Divider borderColor="whiteAlpha.300" />
                    
                    {/* DHCP Status */}
                    <Box bg={dhcpEnabled ? "green.900" : "red.900"} p={4} rounded="lg" border="2px solid" borderColor={dhcpEnabled ? "green.500" : "red.500"}>
                      <HStack justify="space-between">
                        <Box>
                          <Text color={dhcpEnabled ? "green.400" : "red.400"} fontSize="xs" fontWeight="bold">DHCP SERVER</Text>
                          <Text color="white" fontWeight="bold" fontSize="lg">{dhcpEnabled ? "HABILITADO" : "DESABILITADO"}</Text>
                        </Box>
                        <Badge colorScheme={dhcpEnabled ? "green" : "red"} variant="solid" fontSize="md" px={3} py={1}>
                          {dhcpEnabled ? "ON" : "OFF"}
                        </Badge>
                      </HStack>
                    </Box>
                    
                    <SimpleGrid columns={3} spacing={2}>
                      <Box bg="green.800" p={3} rounded="md" textAlign="center" border="1px solid" borderColor="green.600">
                        <Text color="green.200" fontSize="xs" fontWeight="semibold">IP Inicial</Text>
                        <Text color="white" fontWeight="bold" fontSize="sm" fontFamily="mono">{dhcpStart}</Text>
                      </Box>
                      <Box bg="red.800" p={3} rounded="md" textAlign="center" border="1px solid" borderColor="red.600">
                        <Text color="red.200" fontSize="xs" fontWeight="semibold">IP Final</Text>
                        <Text color="white" fontWeight="bold" fontSize="sm" fontFamily="mono">{dhcpEnd}</Text>
                      </Box>
                      <Box bg="blue.800" p={3} rounded="md" textAlign="center" border="1px solid" borderColor="blue.600">
                        <Text color="blue.200" fontSize="xs" fontWeight="semibold">Lease</Text>
                        <Text color="white" fontWeight="bold">{Math.floor(Number(dhcpLeaseTime) / 3600)}h</Text>
                      </Box>
                    </SimpleGrid>
                    
                    {/* DNS Section */}
                    <Divider borderColor="whiteAlpha.300" />
                    <Text color="cyan.400" fontSize="xs" fontWeight="bold" textTransform="uppercase">
                      Servidores DNS
                    </Text>
                    <SimpleGrid columns={2} spacing={3}>
                      <Box bg="cyan.900" p={3} rounded="md" border="1px solid" borderColor="cyan.600">
                        <Text color="cyan.200" fontSize="xs" fontWeight="semibold">DNS para Clientes</Text>
                        <Text color="white" fontWeight="bold" fontSize="sm" fontFamily="mono">{lanDNSServers || "—"}</Text>
                      </Box>
                      {lanRemoteDns && (
                        <Box bg="blue.900" p={3} rounded="md" border="1px solid" borderColor="blue.600">
                          <Text color="blue.200" fontSize="xs" fontWeight="semibold">DNS Remoto</Text>
                          <Text color="white" fontWeight="bold" fontSize="xs" fontFamily="mono">{lanRemoteDns}</Text>
                        </Box>
                      )}
                    </SimpleGrid>
                    <SimpleGrid columns={2} spacing={3}>
                      {lanIpRouters && (
                        <Box bg="orange.900" p={3} rounded="md" border="1px solid" borderColor="orange.600">
                          <Text color="orange.200" fontSize="xs" fontWeight="semibold">IP Routers (DHCP Opt 3)</Text>
                          <Text color="white" fontWeight="bold" fontFamily="mono">{lanIpRouters}</Text>
                        </Box>
                      )}
                      {lanRemoteGw && (
                        <Box bg="teal.900" p={3} rounded="md" border="1px solid" borderColor="teal.600">
                          <Text color="teal.200" fontSize="xs" fontWeight="semibold">Gateway Remoto</Text>
                          <Text color="white" fontWeight="bold" fontFamily="mono">{lanRemoteGw}</Text>
                        </Box>
                      )}
                    </SimpleGrid>
                  </VStack>
                  
                  <Divider my={4} borderColor="whiteAlpha.300" />
                  
                  <LanConfig device={device} />
                </InfoCard>

                <InfoCard title="Topologia LAN" icon={<FiServer />} borderColor="blue.500">
                  <LanTopology device={device} />
                </InfoCard>

                <InfoCard title="Dispositivos Conectados" icon={<FiUsers />} borderColor="cyan.500">
                  <DispositivosConectados device={device} />
                </InfoCard>

                <InfoCard title="Firewall / Portas" icon={<FiShield />} borderColor="red.500">
                  <FirewallPortas device={device} />
                </InfoCard>
              </SimpleGrid>
            </TabPanel>

            {/* ================== GPON / PON (ONT/ONU) ================== */}
            {isONU && (
              <TabPanel px={0}>
                <GPONInfo device={device} />
              </TabPanel>
            )}

            {/* ================== DIAGNÓSTICOS ================== */}
            <TabPanel px={0}>
              <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={6}>
                <InfoCard title="Testes de Conectividade" icon={<FiTerminal />} borderColor="green.500">
                  <TesteConectividade deviceId={device?._id ? String(device._id) : ""} />
                </InfoCard>

                <InfoCard title="Status de Diagnósticos" icon={<FiActivity />} borderColor="purple.500">
                  <DiagnosticoStatus device={device} />
                </InfoCard>

                <InfoCard title="Ping em Tempo Real" icon={<FiActivity />} borderColor="cyan.500">
                  <PingChart 
                    host={externalIP && externalIP !== "—" ? externalIP : undefined} 
                    fallbackHosts={["8.8.8.8", "1.1.1.1"]} 
                  />
                </InfoCard>
              </SimpleGrid>
            </TabPanel>

            {/* ================== PARÂMETROS ================== */}
            <TabPanel px={0}>
              <InfoCard title="Editor de Parâmetros TR-069" icon={<FiSettings />} borderColor="orange.500">
                <Box bg="orange.900" p={3} rounded="lg" mb={4} border="1px solid" borderColor="orange.600">
                  <Text fontSize="sm" color="orange.200">
                    ⚙️ Visualize e edite todos os parâmetros disponíveis no dispositivo via protocolo TR-069/CWMP.
                  </Text>
                </Box>
                {device?._id ? (
                  <ParametersEditor deviceId={String(device._id)} />
                ) : (
                  <Skeleton h="400px" />
                )}
              </InfoCard>
            </TabPanel>

            {/* ================== CLIENTE IXC ================== */}
            <TabPanel px={0}>
              <ClienteIXCEnhanced login={login} deviceId={device?._id ? String(device._id) : undefined} />
            </TabPanel>

            {/* ================== HISTÓRICO ================== */}
            <TabPanel px={0}>
              <DeviceHistory deviceId={device?._id ? String(device._id) : ""} device={device} />
            </TabPanel>
          </TabPanels>
        </Tabs>
      </Box>

      {/* ================== MODAL EDITAR PPPoE ================== */}
      <Modal isOpen={isPPPOpen} onClose={onPPPClose} size="lg">
        <ModalOverlay bg="blackAlpha.700" />
        <ModalContent bg="gray.800" borderColor="whiteAlpha.200">
          <ModalHeader color="white">Configurar PPPoE</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={4}>
              <Alert status="warning" bg="orange.900" borderRadius="md">
                <AlertIcon />
                <Text fontSize="sm">Alterações na conexão PPPoE podem desconectar o dispositivo temporariamente.</Text>
              </Alert>
              
              <FormControl>
                <FormLabel color="gray.400">Usuário PPPoE</FormLabel>
                <Input 
                  defaultValue={login || ""} 
                  placeholder="usuario@provedor"
                  bg="gray.700"
                />
              </FormControl>
              
              <FormControl>
                <FormLabel color="gray.400">Senha PPPoE</FormLabel>
                <Input 
                  type="password"
                  defaultValue={pppPassword} 
                  placeholder="••••••••"
                  bg="gray.700"
                />
              </FormControl>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={onPPPClose}>Cancelar</Button>
            <Button colorScheme="cyan">Salvar e Reconectar</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* ================== MODAL EDITAR WIFI ================== */}
      <Modal isOpen={isWifiOpen} onClose={onWifiClose} size="xl">
        <ModalOverlay bg="blackAlpha.700" />
        <ModalContent bg="gray.800" borderColor="whiteAlpha.200">
          <ModalHeader color="white">Configurar Wi-Fi</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <SimpleGrid columns={2} spacing={6}>
              <Box>
                <Heading size="sm" color="cyan.300" mb={4}>2.4 GHz</Heading>
                <VStack spacing={3}>
                  <FormControl>
                    <FormLabel color="gray.400" fontSize="sm">SSID</FormLabel>
                    <Input 
                      defaultValue={ssid24} 
                      bg="gray.700"
                      onChange={(e) => setWifiEdit({...wifiEdit, ssid24: e.target.value})}
                    />
                  </FormControl>
                  <FormControl>
                    <FormLabel color="gray.400" fontSize="sm">Senha</FormLabel>
                    <Input 
                      type="password"
                      defaultValue={wifiPass24} 
                      bg="gray.700"
                      onChange={(e) => setWifiEdit({...wifiEdit, pass24: e.target.value})}
                    />
                  </FormControl>
                  <FormControl>
                    <FormLabel color="gray.400" fontSize="sm">Canal</FormLabel>
                    <Select defaultValue={channel24} bg="gray.700">
                      <option value="Auto">Auto</option>
                      {[1,2,3,4,5,6,7,8,9,10,11].map(ch => (
                        <option key={ch} value={String(ch)}>{ch}</option>
                      ))}
                    </Select>
                  </FormControl>
                </VStack>
              </Box>
              
              <Box>
                <Heading size="sm" color="purple.300" mb={4}>5 GHz</Heading>
                <VStack spacing={3}>
                  <FormControl>
                    <FormLabel color="gray.400" fontSize="sm">SSID</FormLabel>
                    <Input 
                      defaultValue={ssid5} 
                      bg="gray.700"
                      onChange={(e) => setWifiEdit({...wifiEdit, ssid5: e.target.value})}
                    />
                  </FormControl>
                  <FormControl>
                    <FormLabel color="gray.400" fontSize="sm">Senha</FormLabel>
                    <Input 
                      type="password"
                      defaultValue={wifiPass5} 
                      bg="gray.700"
                      onChange={(e) => setWifiEdit({...wifiEdit, pass5: e.target.value})}
                    />
                  </FormControl>
                  <FormControl>
                    <FormLabel color="gray.400" fontSize="sm">Canal</FormLabel>
                    <Select defaultValue={channel5} bg="gray.700">
                      <option value="Auto">Auto</option>
                      {[36,40,44,48,52,56,60,64,100,104,108,112,116,120,124,128,132,136,140,149,153,157,161,165].map(ch => (
                        <option key={ch} value={String(ch)}>{ch}</option>
                      ))}
                    </Select>
                  </FormControl>
                </VStack>
              </Box>
            </SimpleGrid>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={onWifiClose}>Cancelar</Button>
            <Button colorScheme="cyan" leftIcon={<FiSave />}>Salvar Configurações</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* ================== MODAL CONFIGURAR INFORM ================== */}
      <Modal isOpen={isInformOpen} onClose={onInformClose} size="md">
        <ModalOverlay bg="blackAlpha.700" />
        <ModalContent bg="gray.800" borderColor="whiteAlpha.200">
          <ModalHeader color="white">⚙️ Configurar Inform Automático</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={4} align="stretch">
              <Alert status="info" bg="blue.900" borderRadius="md">
                <AlertIcon />
                <Box fontSize="sm">
                  <Text fontWeight="bold">Periodic Inform</Text>
                  <Text fontSize="xs">
                    O dispositivo enviará automaticamente informações para o GenieACS no intervalo configurado.
                    Isso mantém o dispositivo online e permite monitoramento contínuo.
                  </Text>
                </Box>
              </Alert>

              <FormControl>
                <FormLabel color="gray.300">Intervalo de Inform</FormLabel>
                <Select 
                  value={informInterval} 
                  onChange={(e) => setInformInterval(Number(e.target.value))}
                  bg="gray.700"
                  color="white"
                >
                  <option value={0}>Desabilitado</option>
                  <option value={60}>1 minuto (60s)</option>
                  <option value={300}>5 minutos (300s)</option>
                  <option value={600}>10 minutos (600s)</option>
                  <option value={1800}>30 minutos (1800s)</option>
                  <option value={3600}>1 hora (3600s)</option>
                  <option value={86400}>24 horas (86400s)</option>
                </Select>
                <Text fontSize="xs" color="gray.400" mt={2}>
                  ⚠️ Intervalos muito curtos podem sobrecarregar o servidor. Recomendado: 5-10 minutos.
                </Text>
              </FormControl>

              {device && (
                <Box bg="gray.700" p={3} borderRadius="md">
                  <Text fontSize="xs" color="gray.400" mb={1}>Configuração atual:</Text>
                  <HStack spacing={2} fontSize="sm">
                    <Badge colorScheme={
                      (device as any).Device?.ManagementServer?.PeriodicInformEnable?._value === true ||
                      (device as any).InternetGatewayDevice?.ManagementServer?.PeriodicInformEnable?._value === true
                        ? "green" : "red"
                    }>
                      {(device as any).Device?.ManagementServer?.PeriodicInformEnable?._value === true ||
                       (device as any).InternetGatewayDevice?.ManagementServer?.PeriodicInformEnable?._value === true
                        ? "Habilitado" : "Desabilitado"}
                    </Badge>
                    <Text color="gray.300">
                      Intervalo: {
                        (device as any).Device?.ManagementServer?.PeriodicInformInterval?._value ||
                        (device as any).InternetGatewayDevice?.ManagementServer?.PeriodicInformInterval?._value ||
                        86400
                      }s
                    </Text>
                  </HStack>
                </Box>
              )}
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={onInformClose}>Cancelar</Button>
            <Button 
              colorScheme="green" 
              leftIcon={<FiSave />} 
              onClick={handleSaveInform}
              isLoading={savingInform}
            >
              Aplicar Configuração
            </Button>
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
