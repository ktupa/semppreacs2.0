// src/components/WifiConfigDualBand.tsx
// Componente Premium de Configuração WiFi Dual Band com suporte TR-098/TR-181

import {
  Box, Text, Badge, HStack, VStack, Grid, GridItem,
  FormControl, FormLabel, Select, Input, Switch, Checkbox,
  Slider, SliderTrack, SliderFilledTrack, SliderThumb,
  Tabs, TabList, TabPanels, Tab, TabPanel,
  Button, IconButton, useToast,
  Table, Thead, Tbody, Tr, Th, Td, Code, SimpleGrid, Divider,
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter,
  ModalCloseButton, useDisclosure, Spinner, Alert, AlertIcon
} from "@chakra-ui/react";
import { useEffect, useState, useCallback } from "react";
import { ViewIcon, ViewOffIcon, RepeatIcon, CheckIcon } from "@chakra-ui/icons";
import { Wifi, Radio, Users, Zap } from "lucide-react";
import { setParameterValues, createTask } from "../services/genieAcsApi";
import TR069Normalizer, { detectDataModel, getPath, buildSetParams } from "../services/tr069Normalizer";

// ============ Tipos ============
interface WifiConfigDualBandProps {
  device: any;
  deviceId: string;
  onApplied?: () => void;
}

type SecurityMode = "open" | "wpa2" | "wpa3" | "wpa2-wpa3" | "wep";

interface RadioConfig {
  enabled: boolean;
  ssid: string;
  password: string;
  showPassword: boolean;
  security: SecurityMode;
  encryption: "AES" | "TKIP" | "Auto";
  autoChannel: boolean;
  channel: string;
  bandwidth: string;
  txPower: number;
  hidden: boolean;
  wmm: boolean;
  isolation: boolean;
}

interface WifiClient {
  mac: string;
  hostname?: string;
  rssi?: number;
  band: "2.4GHz" | "5GHz";
  connected: boolean;
}

// ============ Constantes ============
const CHANNELS_24GHZ = ["Auto", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13"];
const CHANNELS_5GHZ = ["Auto", "36", "40", "44", "48", "52", "56", "60", "64", "100", "104", "108", "112", "116", "120", "124", "128", "132", "136", "140", "149", "153", "157", "161", "165"];
const BANDWIDTHS_24GHZ = ["20MHz", "40MHz", "Auto"];
const BANDWIDTHS_5GHZ = ["20MHz", "40MHz", "80MHz", "160MHz", "Auto"];

const DEFAULT_RADIO_CONFIG: RadioConfig = {
  enabled: true,
  ssid: "",
  password: "",
  showPassword: false,
  security: "wpa2",
  encryption: "AES",
  autoChannel: true,
  channel: "Auto",
  bandwidth: "Auto",
  txPower: 100,
  hidden: false,
  wmm: true,
  isolation: false,
};

// ============ Componente Principal ============
export default function WifiConfigDualBand({ device, deviceId, onApplied }: WifiConfigDualBandProps) {
  const toast = useToast();
  const { isOpen: isConfirmOpen, onOpen: onConfirmOpen, onClose: onConfirmClose } = useDisclosure();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const [pendingRadio, setPendingRadio] = useState<1 | 2>(1);
  
  // Configurações dos rádios
  const [radio24, setRadio24] = useState<RadioConfig>({ ...DEFAULT_RADIO_CONFIG });
  const [radio5, setRadio5] = useState<RadioConfig>({ ...DEFAULT_RADIO_CONFIG });
  
  // Clientes conectados
  const [clients, setClients] = useState<WifiClient[]>([]);
  
  // Detecta o Data Model do dispositivo
  const dataModel = device ? detectDataModel(device) : "TR-098";
  const manufacturer = device?._deviceId?._Manufacturer || "Unknown";

  // ============ Carregar configurações do dispositivo ============
  const loadConfig = useCallback(() => {
    if (!device) return;
    setLoading(true);

    try {
      // Rádio 2.4GHz (geralmente índice 1)
      const wifi24 = TR069Normalizer.getWifiParams(device, 1);
      setRadio24({
        enabled: wifi24.enabled === true || wifi24.enabled === "1" || wifi24.enabled === "true",
        ssid: wifi24.ssid || "",
        password: wifi24.password || "",
        showPassword: false,
        security: mapSecurityMode(wifi24.securityMode),
        encryption: wifi24.encryption === "TKIP" ? "TKIP" : "AES",
        autoChannel: wifi24.autoChannel === true || wifi24.autoChannel === "1",
        channel: String(wifi24.channel || "Auto"),
        bandwidth: wifi24.bandwidth || "Auto",
        txPower: Number(wifi24.txPower) || 100,
        hidden: !wifi24.hidden, // SSIDAdvertisementEnabled é invertido
        wmm: wifi24.wmm === true || wifi24.wmm === "1",
        isolation: wifi24.isolation === true || wifi24.isolation === "1",
      });

      // Rádio 5GHz (geralmente índice 2)
      const wifi5 = TR069Normalizer.getWifiParams(device, 2);
      setRadio5({
        enabled: wifi5.enabled === true || wifi5.enabled === "1" || wifi5.enabled === "true",
        ssid: wifi5.ssid || "",
        password: wifi5.password || "",
        showPassword: false,
        security: mapSecurityMode(wifi5.securityMode),
        encryption: wifi5.encryption === "TKIP" ? "TKIP" : "AES",
        autoChannel: wifi5.autoChannel === true || wifi5.autoChannel === "1",
        channel: String(wifi5.channel || "Auto"),
        bandwidth: wifi5.bandwidth || "Auto",
        txPower: Number(wifi5.txPower) || 100,
        hidden: !wifi5.hidden,
        wmm: wifi5.wmm === true || wifi5.wmm === "1",
        isolation: wifi5.isolation === true || wifi5.isolation === "1",
      });

      // Carregar clientes conectados
      loadClients();
    } catch (err) {
      console.error("Erro ao carregar config WiFi:", err);
      toast({
        status: "error",
        title: "Erro ao carregar configurações",
        description: String(err),
      });
    } finally {
      setLoading(false);
    }
  }, [device, toast]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // ============ Mapear modo de segurança ============
  const mapSecurityMode = (mode: string): SecurityMode => {
    const m = String(mode).toLowerCase();
    if (m.includes("wpa3") && m.includes("wpa2")) return "wpa2-wpa3";
    if (m.includes("wpa3") || m.includes("sae")) return "wpa3";
    if (m.includes("wpa2") || m.includes("11i")) return "wpa2";
    if (m.includes("wep")) return "wep";
    if (m.includes("open") || m.includes("none") || m === "") return "open";
    return "wpa2"; // Default
  };

  // ============ Carregar clientes conectados ============
  const loadClients = () => {
    // TODO: Implementar busca de clientes via TR-069
    // Por enquanto, placeholder
    setClients([]);
  };

  // ============ Aplicar configurações ============
  const applyConfig = async (radio: 1 | 2) => {
    if (!deviceId) return;
    
    setSaving(true);
    const config = radio === 1 ? radio24 : radio5;
    const bandName = radio === 1 ? "2.4GHz" : "5GHz";

    try {
      // Construir parâmetros usando normalizador
      const params = buildSetParams(device, [
        { path: "wifi.radio.enable", value: config.enabled, vars: { radio } },
        { path: "wifi.ssid", value: config.ssid, vars: { radio } },
        { path: "wifi.security.password", value: config.password, vars: { radio } },
        { path: "wifi.radio.channel", value: config.autoChannel ? "0" : config.channel, vars: { radio } },
        { path: "wifi.radio.auto_channel", value: config.autoChannel, vars: { radio } },
        { path: "wifi.radio.bandwidth", value: config.bandwidth, vars: { radio } },
        { path: "wifi.radio.txpower", value: config.txPower, vars: { radio } },
        { path: "wifi.ssid.hidden", value: !config.hidden, vars: { radio } }, // Invertido
        { path: "wifi.wmm", value: config.wmm, vars: { radio } },
        { path: "wifi.isolation", value: config.isolation, vars: { radio } },
      ]);

      // Adicionar modo de segurança
      const securityPath = getPath(device, "wifi.security.mode", { radio });
      const securityValue = mapSecurityToTR069(config.security, dataModel);
      params.push([securityPath, securityValue, "xsd:string"]);

      // Enviar para o dispositivo
      await setParameterValues(deviceId, params.map(([name, value, type]) => ({
        name,
        value,
        type: type as any,
      })));

      toast({
        status: "success",
        title: `WiFi ${bandName} configurado`,
        description: `Configurações aplicadas com sucesso (${dataModel})`,
      });

      onApplied?.();
    } catch (err: any) {
      console.error("Erro ao aplicar config WiFi:", err);
      toast({
        status: "error",
        title: "Erro ao aplicar configurações",
        description: err?.message || String(err),
      });
    } finally {
      setSaving(false);
      onConfirmClose();
    }
  };

  // ============ Mapear segurança para TR-069 ============
  const mapSecurityToTR069 = (mode: SecurityMode, model: string): string => {
    if (model === "TR-181") {
      switch (mode) {
        case "open": return "None";
        case "wpa2": return "WPA2-Personal";
        case "wpa3": return "WPA3-Personal";
        case "wpa2-wpa3": return "WPA2-WPA3-Personal";
        case "wep": return "WEP-64";
        default: return "WPA2-Personal";
      }
    } else {
      // TR-098
      switch (mode) {
        case "open": return "None";
        case "wpa2": return "WPA2PSK";
        case "wpa3": return "WPA3SAE";
        case "wpa2-wpa3": return "WPA2PSKWPA3SAE";
        case "wep": return "WEP";
        default: return "WPA2PSK";
      }
    }
  };

  // ============ Solicitar reboot ============
  const requestReboot = async () => {
    try {
      await createTask(deviceId, { name: "reboot" });
      toast({
        status: "info",
        title: "Reboot solicitado",
        description: "O dispositivo será reiniciado para aplicar as alterações.",
      });
    } catch (err) {
      toast({
        status: "error",
        title: "Erro ao solicitar reboot",
      });
    }
  };

  // ============ Confirmar aplicação ============
  const handleApplyClick = (radio: 1 | 2) => {
    setPendingRadio(radio);
    onConfirmOpen();
  };

  // ============ Render: Radio Tab Panel ============
  const renderRadioPanel = (radio: 1 | 2) => {
    const config = radio === 1 ? radio24 : radio5;
    const setConfig = radio === 1 ? setRadio24 : setRadio5;
    const channels = radio === 1 ? CHANNELS_24GHZ : CHANNELS_5GHZ;
    const bandwidths = radio === 1 ? BANDWIDTHS_24GHZ : BANDWIDTHS_5GHZ;
    const bandName = radio === 1 ? "2.4GHz" : "5GHz";
    const bandColor = radio === 1 ? "blue" : "purple";

    return (
      <VStack spacing={6} align="stretch" p={4}>
        {/* Header */}
        <HStack justify="space-between">
          <HStack>
            <Radio size={20} color="#63B3ED" />
            <Text fontSize="lg" fontWeight="bold" color="white">Rádio {bandName}</Text>
            <Badge colorScheme={config.enabled ? "green" : "gray"}>
              {config.enabled ? "Ativo" : "Desativado"}
            </Badge>
          </HStack>
          <Switch
            colorScheme={bandColor}
            isChecked={config.enabled}
            onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
          />
        </HStack>

        <Divider />

        {/* Grid de Configurações */}
        <Grid templateColumns="repeat(2, 1fr)" gap={6}>
          {/* SSID */}
          <GridItem>
            <FormControl>
              <FormLabel color="white" fontWeight="semibold">Nome da Rede (SSID)</FormLabel>
              <Input
                value={config.ssid}
                onChange={(e) => setConfig({ ...config, ssid: e.target.value })}
                placeholder={`MinhaRede_${bandName}`}
                maxLength={32}
                bg="gray.700"
                color="white"
                borderColor="gray.600"
                _placeholder={{ color: "gray.400" }}
              />
            </FormControl>
          </GridItem>

          {/* Segurança */}
          <GridItem>
            <FormControl>
              <FormLabel color="white" fontWeight="semibold">Segurança</FormLabel>
              <Select
                value={config.security}
                onChange={(e) => setConfig({ ...config, security: e.target.value as SecurityMode })}
                bg="gray.700"
                color="white"
                borderColor="gray.600"
              >
                <option value="wpa2">WPA2-Personal</option>
                <option value="wpa3">WPA3-Personal</option>
                <option value="wpa2-wpa3">WPA2/WPA3 (Misto)</option>
                <option value="open">Aberta (Sem Senha)</option>
              </Select>
            </FormControl>
          </GridItem>

          {/* Senha */}
          {config.security !== "open" && (
            <GridItem colSpan={2}>
              <FormControl>
                <FormLabel color="white" fontWeight="semibold">Senha WiFi</FormLabel>
                <HStack>
                  <Input
                    type={config.showPassword ? "text" : "password"}
                    value={config.password}
                    onChange={(e) => setConfig({ ...config, password: e.target.value })}
                    placeholder="Mínimo 8 caracteres"
                    minLength={8}
                    maxLength={63}
                    bg="gray.700"
                    color="white"
                    borderColor="gray.600"
                    _placeholder={{ color: "gray.400" }}
                  />
                  <IconButton
                    aria-label="Mostrar senha"
                    icon={config.showPassword ? <ViewOffIcon /> : <ViewIcon />}
                    onClick={() => setConfig({ ...config, showPassword: !config.showPassword })}
                  />
                </HStack>
              </FormControl>
            </GridItem>
          )}

          {/* Canal */}
          <GridItem>
            <FormControl>
              <FormLabel color="white" fontWeight="semibold">
                Canal
                <Checkbox
                  ml={4}
                  isChecked={config.autoChannel}
                  onChange={(e) => setConfig({ ...config, autoChannel: e.target.checked })}
                  colorScheme="cyan"
                >
                  <Text as="span" color="gray.300">Automático</Text>
                </Checkbox>
              </FormLabel>
              <Select
                value={config.channel}
                onChange={(e) => setConfig({ ...config, channel: e.target.value })}
                isDisabled={config.autoChannel}
                bg="gray.700"
                color="white"
                borderColor="gray.600"
              >
                {channels.map((ch) => (
                  <option key={ch} value={ch}>{ch}</option>
                ))}
              </Select>
            </FormControl>
          </GridItem>

          {/* Largura de Banda */}
          <GridItem>
            <FormControl>
              <FormLabel color="white" fontWeight="semibold">Largura de Banda</FormLabel>
              <Select
                value={config.bandwidth}
                onChange={(e) => setConfig({ ...config, bandwidth: e.target.value })}
                bg="gray.700"
                color="white"
                borderColor="gray.600"
              >
                {bandwidths.map((bw) => (
                  <option key={bw} value={bw}>{bw}</option>
                ))}
              </Select>
            </FormControl>
          </GridItem>

          {/* Potência TX */}
          <GridItem colSpan={2}>
            <FormControl>
              <FormLabel color="white" fontWeight="semibold">
                Potência de Transmissão: <Text as="span" color="cyan.300">{config.txPower}%</Text>
              </FormLabel>
              <Slider
                value={config.txPower}
                onChange={(val) => setConfig({ ...config, txPower: val })}
                min={10}
                max={100}
                step={10}
              >
                <SliderTrack>
                  <SliderFilledTrack bg={`${bandColor}.500`} />
                </SliderTrack>
                <SliderThumb boxSize={5}>
                  <Zap size={12} />
                </SliderThumb>
              </Slider>
            </FormControl>
          </GridItem>
        </Grid>

        <Divider />

        {/* Opções Avançadas */}
        <Text fontWeight="semibold" color="cyan.400">Opções Avançadas</Text>
        <SimpleGrid columns={3} spacing={4}>
          <Checkbox
            isChecked={config.hidden}
            onChange={(e) => setConfig({ ...config, hidden: e.target.checked })}
            colorScheme="cyan"
          >
            <Text color="white">Ocultar SSID</Text>
          </Checkbox>
          <Checkbox
            isChecked={config.wmm}
            onChange={(e) => setConfig({ ...config, wmm: e.target.checked })}
            colorScheme="cyan"
          >
            <Text color="white">WMM (QoS)</Text>
          </Checkbox>
          <Checkbox
            isChecked={config.isolation}
            onChange={(e) => setConfig({ ...config, isolation: e.target.checked })}
            colorScheme="cyan"
          >
            <Text color="white">Isolamento AP</Text>
          </Checkbox>
        </SimpleGrid>

        <Divider />

        {/* Botões de Ação */}
        <HStack justify="flex-end" spacing={4}>
          <Button
            leftIcon={<RepeatIcon />}
            variant="outline"
            onClick={loadConfig}
            isDisabled={saving}
          >
            Recarregar
          </Button>
          <Button
            colorScheme={bandColor}
            leftIcon={<CheckIcon />}
            onClick={() => handleApplyClick(radio)}
            isLoading={saving}
            loadingText="Aplicando..."
          >
            Aplicar {bandName}
          </Button>
        </HStack>
      </VStack>
    );
  };

  // ============ Render: Clientes Conectados ============
  const renderClients = () => (
    <VStack spacing={4} align="stretch" p={4}>
      <HStack>
        <Users size={20} color="#63B3ED" />
        <Text fontSize="lg" fontWeight="bold" color="white">Clientes Conectados</Text>
        <Badge colorScheme="blue">{clients.length}</Badge>
      </HStack>

      {clients.length === 0 ? (
        <Alert status="info" borderRadius="md" bg="blue.900" border="1px solid" borderColor="blue.700">
          <AlertIcon color="blue.300" />
          <Text color="white">Nenhum cliente conectado ou dados não disponíveis via TR-069.</Text>
        </Alert>
      ) : (
        <Table size="sm" variant="simple">
          <Thead>
            <Tr>
              <Th color="gray.300">MAC</Th>
              <Th color="gray.300">Hostname</Th>
              <Th color="gray.300">Banda</Th>
              <Th color="gray.300">RSSI</Th>
            </Tr>
          </Thead>
          <Tbody>
            {clients.map((client) => (
              <Tr key={client.mac}>
                <Td><Code bg="gray.700" color="cyan.300">{client.mac}</Code></Td>
                <Td color="white">{client.hostname || "-"}</Td>
                <Td>
                  <Badge colorScheme={client.band === "5GHz" ? "purple" : "blue"}>
                    {client.band}
                  </Badge>
                </Td>
                <Td color="white">{client.rssi ? `${client.rssi} dBm` : "-"}</Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </VStack>
  );

  // ============ Loading State ============
  if (loading) {
    return (
      <Box bg="gray.800" p={6} borderRadius="lg" textAlign="center">
        <Spinner size="xl" color="blue.400" />
        <Text mt={4} color="gray.400">Carregando configurações WiFi...</Text>
      </Box>
    );
  }

  // ============ Render Principal ============
  return (
    <Box bg="gray.800" borderRadius="lg" overflow="hidden" border="1px solid" borderColor="gray.700">
      {/* Header */}
      <HStack bg="gray.900" p={4} justify="space-between">
        <HStack>
          <Wifi size={24} color="#4299E1" />
          <VStack align="start" spacing={0}>
            <Text fontSize="lg" fontWeight="bold" color="white">
              Configuração WiFi Dual Band
            </Text>
            <HStack spacing={2}>
              <Badge colorScheme="cyan">{dataModel}</Badge>
              <Badge colorScheme="gray">{manufacturer}</Badge>
            </HStack>
          </VStack>
        </HStack>
        <Button
          size="sm"
          colorScheme="orange"
          variant="outline"
          leftIcon={<RepeatIcon />}
          onClick={requestReboot}
        >
          Reiniciar CPE
        </Button>
      </HStack>

      {/* Tabs */}
      <Tabs index={activeTab} onChange={setActiveTab} colorScheme="blue" variant="enclosed-colored">
        <TabList bg="gray.900" px={4}>
          <Tab _selected={{ bg: "blue.600", color: "white" }} color="gray.300">
            <HStack>
              <Radio size={16} />
              <Text>2.4GHz</Text>
              {radio24.enabled && <Badge colorScheme="green" size="sm">ON</Badge>}
            </HStack>
          </Tab>
          <Tab _selected={{ bg: "purple.600", color: "white" }} color="gray.300">
            <HStack>
              <Radio size={16} />
              <Text>5GHz</Text>
              {radio5.enabled && <Badge colorScheme="green" size="sm">ON</Badge>}
            </HStack>
          </Tab>
          <Tab _selected={{ bg: "cyan.600", color: "white" }} color="gray.300">
            <HStack>
              <Users size={16} />
              <Text>Clientes</Text>
              <Badge colorScheme="blue">{clients.length}</Badge>
            </HStack>
          </Tab>
        </TabList>

        <TabPanels>
          <TabPanel p={0}>{renderRadioPanel(1)}</TabPanel>
          <TabPanel p={0}>{renderRadioPanel(2)}</TabPanel>
          <TabPanel p={0}>{renderClients()}</TabPanel>
        </TabPanels>
      </Tabs>

      {/* Modal de Confirmação */}
      <Modal isOpen={isConfirmOpen} onClose={onConfirmClose} isCentered>
        <ModalOverlay />
        <ModalContent bg="gray.800">
          <ModalHeader color="white">Confirmar Alterações</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Alert status="warning" borderRadius="md" mb={4}>
              <AlertIcon />
              <Text>
                As configurações serão enviadas para o dispositivo via TR-069.
                Algumas alterações podem exigir reinicialização da CPE.
              </Text>
            </Alert>
            <Text color="gray.300">
              Banda: <Badge colorScheme={pendingRadio === 1 ? "blue" : "purple"}>
                {pendingRadio === 1 ? "2.4GHz" : "5GHz"}
              </Badge>
            </Text>
            <Text color="gray.300" mt={2}>
              Data Model: <Badge colorScheme="cyan">{dataModel}</Badge>
            </Text>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={onConfirmClose}>
              Cancelar
            </Button>
            <Button
              colorScheme="blue"
              onClick={() => applyConfig(pendingRadio)}
              isLoading={saving}
            >
              Confirmar
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}
