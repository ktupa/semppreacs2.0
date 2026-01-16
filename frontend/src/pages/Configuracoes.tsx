import {
  Box,
  Text,
  Input,
  Button,
  VStack,
  HStack,
  useToast,
  FormControl,
  FormLabel,
  FormHelperText,
  Switch,
  Select,
  SimpleGrid,
  Divider,
  Badge,
  Icon,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  Tabs,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
  Alert,
  AlertIcon,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  Progress,
  Code,
  Spinner,
} from "@chakra-ui/react";
import { useState, useEffect, useCallback } from "react";
import {
  FaCog,
  FaSync,
  FaClock,
  FaServer,
  FaDatabase,
  FaShieldAlt,
  FaEye,
  FaEyeSlash,
  FaPlay,
  FaCheck,
} from "react-icons/fa";
import axios from "axios";
import SystemUpdater from "../components/SystemUpdater";

const API_BASE = import.meta.env.VITE_API_BASE || "";

interface PeriodicInformStatus {
  enabled: boolean;
  interval_minutes: number;
  running: boolean;
  last_run: string | null;
  next_run: string | null;
  devices_count: number;
  success_count: number;
  fail_count: number;
}

interface SystemStats {
  total_devices: number;
  online_devices: number;
  offline_devices: number;
  periodic_inform_enabled: boolean;
  last_inform_run: string | null;
}

interface LocalConfig {
  acs_url: string;
  metrics_collection_interval: number;
  metrics_retention_days: number;
  auto_refresh_enabled: boolean;
  auto_refresh_interval: number;
}

export default function Configuracoes() {
  const toast = useToast();

  const [informStatus, setInformStatus] = useState<PeriodicInformStatus>({
    enabled: false,
    interval_minutes: 15,
    running: false,
    last_run: null,
    next_run: null,
    devices_count: 0,
    success_count: 0,
    fail_count: 0,
  });

  const [stats, setStats] = useState<SystemStats>({
    total_devices: 0,
    online_devices: 0,
    offline_devices: 0,
    periodic_inform_enabled: false,
    last_inform_run: null,
  });

  const [localConfig, setLocalConfig] = useState<LocalConfig>({
    acs_url: "http://localhost:7557",
    metrics_collection_interval: 60,
    metrics_retention_days: 30,
    auto_refresh_enabled: false,
    auto_refresh_interval: 60,
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [runningNow, setRunningNow] = useState(false);
  const [openaiHasKey, setOpenaiHasKey] = useState(false);
  const [openaiMasked, setOpenaiMasked] = useState<string | null>(null);
  const [openaiKey, setOpenaiKey] = useState("");
  const [openaiLoading, setOpenaiLoading] = useState(false);
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);
  const [openaiModels, setOpenaiModels] = useState<Array<{id: string}>>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [modelsLoading, setModelsLoading] = useState(false);
  const [featureConfigs, setFeatureConfigs] = useState<Record<string, {enabled: boolean; model?: string}>>({});

  const loadData = useCallback(async () => {
    try {
      const [informRes, statsRes, openaiRes, modelRes, featuresRes] = await Promise.all([
        axios.get(`${API_BASE}/config/periodic-inform`),
        axios.get(`${API_BASE}/config/stats`),
        axios.get(`${API_BASE}/config/openai`),
        axios.get(`${API_BASE}/config/openai/model`).catch(() => ({ data: { model: null } })),
        axios.get(`${API_BASE}/config/openai/features`).catch(() => ({ data: {} })),
      ]);
      setInformStatus(informRes.data);
      setStats(statsRes.data);
      setOpenaiHasKey(openaiRes.data?.has_key ?? false);
      setOpenaiMasked(openaiRes.data?.masked ?? null);
      setOpenaiKey("");
      setSelectedModel(modelRes.data?.model ?? "");
      setFeatureConfigs(featuresRes.data ?? {});
    } catch (err) {
      console.error("Erro ao carregar dados:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("semppre_local_config");
    if (saved) {
      try {
        setLocalConfig(JSON.parse(saved));
      } catch {}
    }
    loadData();
  }, [loadData]);

  useEffect(() => {
    // fetch available models from OpenAI
    const loadModels = async () => {
      setModelsLoading(true);
      try {
        const res = await axios.get(`${API_BASE}/integrations/openai/models`);
        const list = res.data?.models || [];
        // models might be objects with id
        setOpenaiModels(list.map((m: any) => ({ id: m.id || m })));
      } catch (err) {
        // ignore if no key configured
        setOpenaiModels([]);
      } finally {
        setModelsLoading(false);
      }
    };
    loadModels();
  }, [openaiHasKey]);

  const saveFeature = async (feature: string, cfg: { enabled: boolean; model?: string }) => {
    try {
      await axios.put(`${API_BASE}/config/openai/features/${feature}`, cfg);
      setFeatureConfigs(prev => ({ ...prev, [feature]: cfg }));
      toast({ title: `Configuração ${feature} salva`, status: 'success', duration: 2000 });
    } catch (err: any) {
      toast({ title: `Erro ao salvar ${feature}`, description: err?.response?.data?.detail || err.message, status: 'error', duration: 4000 });
    }
  };

  const updatePeriodicInform = async (enabled: boolean, intervalMinutes?: number) => {
    try {
      const res = await axios.post(`${API_BASE}/config/periodic-inform`, {
        enabled,
        interval_minutes: intervalMinutes ?? informStatus.interval_minutes,
      });
      setInformStatus(res.data);
      toast({
        title: enabled ? "Inform automático ativado" : "Inform automático desativado",
        status: "success",
        duration: 2000,
      });
    } catch (err: any) {
      toast({
        title: "Erro ao atualizar configuração",
        description: err.message,
        status: "error",
        duration: 3000,
      });
    }
  };

  const runInformNow = async () => {
    setRunningNow(true);
    try {
      await axios.post(`${API_BASE}/config/periodic-inform/run-now`);
      toast({
        title: "Inform iniciado",
        description: "O inform está sendo executado em background",
        status: "info",
        duration: 3000,
      });
      setTimeout(loadData, 2000);
    } catch (err: any) {
      toast({
        title: "Erro ao executar inform",
        description: err.response?.data?.detail || err.message,
        status: "error",
        duration: 3000,
      });
    } finally {
      setRunningNow(false);
    }
  };

  const saveLocalConfig = () => {
    setSaving(true);
    try {
      localStorage.setItem("semppre_local_config", JSON.stringify(localConfig));
      toast({ title: "Configurações salvas", status: "success", duration: 2000 });
    } catch (err) {
      toast({ title: "Erro ao salvar", status: "error", duration: 3000 });
    } finally {
      setSaving(false);
    }
  };

  const updateLocalConfig = (key: keyof LocalConfig, value: any) => {
    setLocalConfig(prev => ({ ...prev, [key]: value }));
  };

  const formatDate = (isoDate: string | null) => {
    if (!isoDate) return "Nunca";
    try {
      return new Date(isoDate).toLocaleString("pt-BR");
    } catch {
      return isoDate;
    }
  };

  if (loading) {
    return (
      <Box p={6} bg="gray.900" minH="100vh" color="white" display="flex" alignItems="center" justifyContent="center">
        <VStack>
          <Spinner size="xl" color="cyan.400" />
          <Text>Carregando configurações...</Text>
        </VStack>
      </Box>
    );
  }

  return (
    <Box p={6} bg="gray.900" minH="100vh" color="white">
      <HStack mb={6} spacing={4}>
        <Box p={3} bg="cyan.500" borderRadius="xl">
          <Icon as={FaCog} boxSize={6} color="white" />
        </Box>
        <VStack align="start" spacing={0}>
          <Text fontSize="2xl" fontWeight="bold">Configurações do Sistema</Text>
          <Text color="cyan.200" fontSize="sm">Gerencie as configurações do ACS</Text>
        </VStack>
        <Button size="sm" variant="outline" colorScheme="cyan" leftIcon={<FaSync />} onClick={loadData} ml="auto">
          Atualizar
        </Button>
      </HStack>

      <SimpleGrid columns={{ base: 2, md: 4 }} spacing={4} mb={6}>
        <Stat bg="linear-gradient(135deg, #1a365d 0%, #2a4365 100%)" p={4} borderRadius="xl" border="1px solid" borderColor="blue.600">
          <StatLabel color="blue.100" fontWeight="semibold">Dispositivos</StatLabel>
          <StatNumber color="white">{stats.total_devices}</StatNumber>
          <StatHelpText color="green.300">{stats.online_devices} online</StatHelpText>
        </Stat>
        <Stat bg="linear-gradient(135deg, #1c4532 0%, #22543d 100%)" p={4} borderRadius="xl" border="1px solid" borderColor="green.500">
          <StatLabel color="green.100" fontWeight="semibold">Auto-Inform</StatLabel>
          <StatNumber>
            <Badge colorScheme={informStatus.enabled ? "green" : "gray"} fontSize="md" px={3} py={1}>
              {informStatus.enabled ? "Ativo" : "Inativo"}
            </Badge>
          </StatNumber>
          <StatHelpText color="gray.300">
            {informStatus.enabled ? `A cada ${informStatus.interval_minutes} min` : "Desativado"}
          </StatHelpText>
        </Stat>
        <Stat bg="linear-gradient(135deg, #44337a 0%, #553c9a 100%)" p={4} borderRadius="xl" border="1px solid" borderColor="purple.500">
          <StatLabel color="purple.100" fontWeight="semibold">Último Inform</StatLabel>
          <StatNumber fontSize="sm" color="white">{formatDate(informStatus.last_run)}</StatNumber>
        </Stat>
        <Stat bg="linear-gradient(135deg, #0c4a6e 0%, #075985 100%)" p={4} borderRadius="xl" border="1px solid" borderColor="cyan.600">
          <StatLabel color="cyan.100" fontWeight="semibold">Próximo Inform</StatLabel>
          <StatNumber fontSize="sm" color="white">{informStatus.enabled ? formatDate(informStatus.next_run) : "—"}</StatNumber>
        </Stat>
      </SimpleGrid>

      <Tabs variant="soft-rounded" colorScheme="cyan">
        <TabList bg="gray.800" borderRadius="xl" p={2} border="1px solid" borderColor="gray.700" flexWrap="wrap">
          <Tab _selected={{ bg: "cyan.500", color: "white" }} color="gray.300" fontWeight="semibold">⚙️ Geral</Tab>
          <Tab _selected={{ bg: "cyan.500", color: "white" }} color="gray.300" fontWeight="semibold">📡 Inform Automático</Tab>
          <Tab _selected={{ bg: "cyan.500", color: "white" }} color="gray.300" fontWeight="semibold">📊 Métricas</Tab>
          <Tab _selected={{ bg: "cyan.500", color: "white" }} color="gray.300" fontWeight="semibold">🔐 Segurança</Tab>
          <Tab _selected={{ bg: "cyan.500", color: "white" }} color="gray.300" fontWeight="semibold">🔄 Sistema</Tab>
        </TabList>

        <TabPanels>
          <TabPanel>
            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={6}>
              <Box bg="gray.800" p={6} borderRadius="xl" border="1px solid" borderColor="gray.600">
                <Text fontWeight="bold" mb={4} color="white"><Icon as={FaServer} mr={2} color="cyan.400" />Servidor ACS</Text>
                <VStack spacing={4}>
                  <FormControl>
                    <FormLabel color="cyan.200" fontWeight="semibold">URL do GenieACS NBI</FormLabel>
                    <Input
                      value={localConfig.acs_url}
                      onChange={(e) => updateLocalConfig("acs_url", e.target.value)}
                      placeholder="http://localhost:7557"
                      bg="gray.700"
                      border="2px solid"
                      borderColor="gray.600"
                      color="white"
                      _hover={{ borderColor: "cyan.500" }}
                      _focus={{ borderColor: "cyan.400", boxShadow: "0 0 0 1px #00B5D8" }}
                    />
                    <FormHelperText color="gray.400">Endereço do servidor GenieACS NBI</FormHelperText>
                  </FormControl>
                </VStack>
              </Box>
              <Box bg="gray.800" p={6} borderRadius="xl" border="1px solid" borderColor="gray.600">
                <Text fontWeight="bold" mb={4} color="white"><Icon as={FaSync} mr={2} color="cyan.400" />Auto-Refresh Dashboard</Text>
                <VStack spacing={4}>
                  <FormControl display="flex" alignItems="center">
                    <FormLabel mb="0">Atualização automática</FormLabel>
                    <Switch
                      isChecked={localConfig.auto_refresh_enabled}
                      onChange={(e) => updateLocalConfig("auto_refresh_enabled", e.target.checked)}
                      colorScheme="cyan"
                    />
                  </FormControl>
                  <FormControl>
                    <FormLabel>Intervalo (segundos)</FormLabel>
                    <NumberInput
                      value={localConfig.auto_refresh_interval}
                      onChange={(_, val) => updateLocalConfig("auto_refresh_interval", val)}
                      min={10}
                      max={600}
                      isDisabled={!localConfig.auto_refresh_enabled}
                    >
                      <NumberInputField bg="gray.700" border="none" />
                      <NumberInputStepper>
                        <NumberIncrementStepper />
                        <NumberDecrementStepper />
                      </NumberInputStepper>
                    </NumberInput>
                  </FormControl>
                </VStack>
              </Box>
            </SimpleGrid>
          </TabPanel>

          <TabPanel>
            <Box bg="gray.800" p={6} borderRadius="xl" mb={6}>
              <HStack justify="space-between" mb={4}>
                <Text fontWeight="bold"><Icon as={FaClock} mr={2} />Inform Automático</Text>
                <Button
                  size="sm"
                  colorScheme="cyan"
                  leftIcon={<FaPlay />}
                  onClick={runInformNow}
                  isLoading={runningNow || informStatus.running}
                  isDisabled={informStatus.running}
                >
                  Executar Agora
                </Button>
              </HStack>

              <Alert status="info" borderRadius="lg" mb={4}>
                <AlertIcon />
                <VStack align="start" spacing={0}>
                  <Text fontWeight="bold">O que é o Inform Automático?</Text>
                  <Text fontSize="sm">
                    Solicita periodicamente que todos os dispositivos enviem seus dados atualizados para o ACS.
                    O processo roda no backend e envia Connection Request para cada CPE.
                  </Text>
                </VStack>
              </Alert>

              {informStatus.running && (
                <Box mb={4}>
                  <HStack justify="space-between" mb={2}>
                    <Text fontSize="sm" color="gray.400">Executando inform em {informStatus.devices_count} dispositivos...</Text>
                    <Badge colorScheme="blue">{informStatus.success_count} sucesso / {informStatus.fail_count} falhas</Badge>
                  </HStack>
                  <Progress isIndeterminate colorScheme="cyan" borderRadius="lg" />
                </Box>
              )}

              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                <FormControl display="flex" alignItems="center">
                  <FormLabel mb="0">Ativar inform automático</FormLabel>
                  <Switch
                    isChecked={informStatus.enabled}
                    onChange={(e) => updatePeriodicInform(e.target.checked)}
                    colorScheme="cyan"
                  />
                </FormControl>
                <FormControl>
                  <FormLabel>Intervalo entre informs</FormLabel>
                  <Select
                    value={informStatus.interval_minutes}
                    onChange={(e) => updatePeriodicInform(informStatus.enabled, Number(e.target.value))}
                    bg="gray.700"
                    border="none"
                  >
                    <option value={5}>5 minutos</option>
                    <option value={10}>10 minutos</option>
                    <option value={15}>15 minutos</option>
                    <option value={30}>30 minutos</option>
                    <option value={60}>1 hora</option>
                    <option value={120}>2 horas</option>
                  </Select>
                </FormControl>
              </SimpleGrid>
            </Box>
          </TabPanel>

          <TabPanel>
            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={6}>
              <Box bg="gray.800" p={6} borderRadius="xl">
                <Text fontWeight="bold" mb={4}><Icon as={FaDatabase} mr={2} />Coleta de Métricas</Text>
                <VStack spacing={4}>
                  <FormControl>
                    <FormLabel>Intervalo de coleta (segundos)</FormLabel>
                    <NumberInput
                      value={localConfig.metrics_collection_interval}
                      onChange={(_, val) => updateLocalConfig("metrics_collection_interval", val)}
                      min={30}
                      max={600}
                    >
                      <NumberInputField bg="gray.700" border="none" />
                      <NumberInputStepper>
                        <NumberIncrementStepper />
                        <NumberDecrementStepper />
                      </NumberInputStepper>
                    </NumberInput>
                  </FormControl>
                  <FormControl>
                    <FormLabel>Retenção de dados (dias)</FormLabel>
                    <NumberInput
                      value={localConfig.metrics_retention_days}
                      onChange={(_, val) => updateLocalConfig("metrics_retention_days", val)}
                      min={1}
                      max={365}
                    >
                      <NumberInputField bg="gray.700" border="none" />
                      <NumberInputStepper>
                        <NumberIncrementStepper />
                        <NumberDecrementStepper />
                      </NumberInputStepper>
                    </NumberInput>
                  </FormControl>
                </VStack>
              </Box>
              <Box bg="gray.800" p={6} borderRadius="xl">
                <Text fontWeight="bold" mb={4}><Icon as={FaDatabase} mr={2} />Armazenamento</Text>
                <VStack spacing={4} align="stretch">
                  <HStack justify="space-between">
                    <Text color="gray.400">Banco de Dados</Text>
                    <Badge colorScheme="green">SQLite</Badge>
                  </HStack>
                  <HStack justify="space-between">
                    <Text color="gray.400">Localização</Text>
                    <Code fontSize="xs">data/semppre_acs.db</Code>
                  </HStack>
                  <Divider />
                  <Button size="sm" variant="outline" colorScheme="red" isDisabled>Limpar Métricas Antigas</Button>
                </VStack>
              </Box>
            </SimpleGrid>
          </TabPanel>

          <TabPanel>
            <Box bg="gray.800" p={6} borderRadius="xl">
              <Text fontWeight="bold" mb={4}><Icon as={FaShieldAlt} mr={2} />Chave OpenAI / ChatGPT</Text>

              <Text fontSize="sm" color="gray.400" mb={3}>
                Configure a chave de API para que o backend possa chamar o serviço OpenAI.
                A chave será armazenada no servidor. Não envie chaves sensíveis em canais públicos.
              </Text>

              <FormControl mb={3}>
                <FormLabel>Chave API OpenAI</FormLabel>
                <Input
                  type={showOpenaiKey ? "text" : "password"}
                  placeholder={openaiHasKey ? openaiMasked || "********" : "sk-..."
                  }
                  value={openaiKey}
                  onChange={(e) => setOpenaiKey(e.target.value)}
                  bg="gray.700"
                  border="none"
                />
                <FormHelperText color="gray.500">A chave será enviada ao servidor e armazenada com segurança.</FormHelperText>
              </FormControl>

              <FormControl mb={3}>
                <FormLabel>Modelo OpenAI</FormLabel>
                <Select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  bg="gray.700"
                  border="none"
                  isDisabled={modelsLoading || openaiModels.length === 0}
                >
                  <option value="">(usar padrão do servidor)</option>
                  {openaiModels.map((m) => (
                    <option key={m.id} value={m.id}>{m.id}</option>
                  ))}
                </Select>
                <FormHelperText color="gray.500">Selecione o modelo que será usado por padrão nas chamadas da IA.</FormHelperText>
              </FormControl>

              <HStack spacing={3} mb={4}>
                <Button
                  colorScheme="cyan"
                  onClick={async () => {
                    if (!selectedModel) {
                      toast({ title: "Selecione um modelo", status: "warning", duration: 2000 });
                      return;
                    }
                    try {
                      const res = await axios.put(`${API_BASE}/config/openai/model`, { model: selectedModel });
                      toast({ title: `Modelo salvo: ${res.data?.model}`, status: "success", duration: 2000 });
                    } catch (err: any) {
                      toast({ title: "Erro ao salvar modelo", description: err?.response?.data?.detail || err.message, status: "error", duration: 4000 });
                    }
                  }}
                  isLoading={modelsLoading}
                >
                  Salvar Modelo
                </Button>

                <Button
                  variant="outline"
                  onClick={async () => {
                    setSelectedModel("");
                    try {
                      // reset to server default by saving empty (server ignores empty)
                      await axios.put(`${API_BASE}/config/openai/model`, { model: "" });
                      toast({ title: "Modelo resetado para padrão do servidor", status: "info", duration: 2000 });
                    } catch (err: any) {
                      toast({ title: "Erro ao resetar modelo", description: err?.response?.data?.detail || err.message, status: "error", duration: 4000 });
                    }
                  }}
                >
                  Resetar
                </Button>
              </HStack>
              <Box mt={4} bg="gray.820" p={4} borderRadius="md">
                <Text fontWeight="bold" mb={3}>IA por Área</Text>
                {['general','device','lan','wan','diagnostics'].map((f) => {
                  const cfg = featureConfigs[f] ?? { enabled: false, model: '' };
                  return (
                    <HStack key={f} mb={3} align="center">
                      <Text width="130px" textTransform="capitalize">{f}</Text>
                      <Switch
                        isChecked={cfg.enabled}
                        onChange={(e) => setFeatureConfigs(prev => ({ ...prev, [f]: { ...(prev[f]||{}), enabled: e.target.checked } }))}
                        colorScheme="cyan"
                      />
                      <Select
                        value={cfg.model || ''}
                        onChange={(e) => setFeatureConfigs(prev => ({ ...prev, [f]: { ...(prev[f]||{}), model: e.target.value } }))}
                        bg="gray.700"
                        border="none"
                        width="360px"
                        isDisabled={modelsLoading || openaiModels.length === 0}
                      >
                        <option value="">(usar padrão do servidor)</option>
                        {openaiModels.map((m) => (
                          <option key={m.id} value={m.id}>{m.id}</option>
                        ))}
                      </Select>
                      <Button size="sm" colorScheme="cyan" onClick={() => saveFeature(f, { enabled: !!cfg.enabled, model: cfg.model })}>Salvar</Button>
                    </HStack>
                  );
                })}
              </Box>

              <HStack spacing={3}>
                <Button
                  colorScheme="cyan"
                  onClick={async () => {
                    setOpenaiLoading(true);
                    try {
                      const payload = { api_key: openaiKey };
                      const res = await axios.put(`${API_BASE}/config/openai`, payload);
                      setOpenaiHasKey(true);
                      setOpenaiMasked(res.data?.masked ?? null);
                      setOpenaiKey("");
                      // if backend returned models, populate select immediately
                      const models = res.data?.models ?? null;
                      if (Array.isArray(models) && models.length > 0) {
                        setOpenaiModels(models.map((m: any) => ({ id: m })));
                        // if no selected model yet, pick the first available
                        if (!selectedModel) setSelectedModel(models[0]);
                      } else {
                        // try to fetch models separately (may fail if key invalid)
                        try {
                          const r2 = await axios.get(`${API_BASE}/integrations/openai/models`);
                          const list = r2.data?.models || [];
                          setOpenaiModels(list.map((m: any) => ({ id: m.id || m })));
                          if (!selectedModel && list.length > 0) setSelectedModel(list[0].id || list[0]);
                        } catch {
                          setOpenaiModels([]);
                        }
                      }

                      toast({ title: "Chave salva", status: "success", duration: 2000 });
                    } catch (err: any) {
                      toast({ title: "Erro ao salvar chave", description: err?.response?.data?.detail || err.message, status: "error", duration: 4000 });
                    } finally {
                      setOpenaiLoading(false);
                    }
                  }}
                  isLoading={openaiLoading}
                >
                  Salvar
                </Button>

                <Button
                  variant="outline"
                  onClick={async () => {
                    setOpenaiLoading(true);
                    try {
                      await axios.delete(`${API_BASE}/config/openai`);
                      setOpenaiHasKey(false);
                      setOpenaiMasked(null);
                      setOpenaiKey("");
                      setOpenaiModels([]);
                      setSelectedModel("");
                      toast({ title: "Chave removida", status: "info", duration: 2000 });
                    } catch (err: any) {
                      toast({ title: "Erro ao remover chave", description: err?.response?.data?.detail || err.message, status: "error", duration: 4000 });
                    } finally {
                      setOpenaiLoading(false);
                    }
                  }}
                >
                  Remover
                </Button>

                <Button
                  variant="ghost"
                  onClick={() => setShowOpenaiKey((s) => !s)}
                >
                  {showOpenaiKey ? <FaEyeSlash /> : <FaEye />} Mostrar
                </Button>
              </HStack>
            </Box>
          </TabPanel>

          {/* Tab Sistema / Atualizações */}
          <TabPanel>
            <VStack spacing={6} align="stretch">
              <SystemUpdater />
              
              <Box bg="gray.800" p={6} borderRadius="xl">
                <Text fontWeight="bold" mb={4}>📋 Informações do Sistema</Text>
                <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
                  <Box p={4} bg="gray.700" borderRadius="md">
                    <Text fontSize="sm" color="gray.400">Servidor</Text>
                    <Text fontWeight="bold">SemPPRE Bridge</Text>
                  </Box>
                  <Box p={4} bg="gray.700" borderRadius="md">
                    <Text fontSize="sm" color="gray.400">Ambiente</Text>
                    <Text fontWeight="bold">Produção</Text>
                  </Box>
                  <Box p={4} bg="gray.700" borderRadius="md">
                    <Text fontSize="sm" color="gray.400">Dispositivos</Text>
                    <Text fontWeight="bold">{stats.total_devices} total</Text>
                  </Box>
                </SimpleGrid>
              </Box>
            </VStack>
          </TabPanel>
        </TabPanels>
      </Tabs>

      <Box mt={6} textAlign="right">
        <Button colorScheme="cyan" size="lg" leftIcon={<FaCheck />} onClick={saveLocalConfig} isLoading={saving}>
          Salvar Configurações Locais
        </Button>
      </Box>
    </Box>
  );
}
