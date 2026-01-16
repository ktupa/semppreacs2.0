// src/components/DeviceHistory.tsx
import {
  Box,
  Text,
  HStack,
  Badge,
  Icon,
  Tabs,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Code,
  Spinner,
  Select,
  Button,
  Tooltip,
  useToast,
  Stat,
  StatLabel,
  StatNumber,
  SimpleGrid,
} from "@chakra-ui/react";
import { useEffect, useState, useMemo } from "react";
import {
  FaHistory,
  FaCheck,
  FaTimes,
  FaClock,
  FaSync,
  FaExclamationTriangle,
  FaInfoCircle,
  FaDownload,
  FaUpload,
  FaWifi,
} from "react-icons/fa";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";
import { getTasks, getFeedsMetrics } from "../services/genieAcsApi";

interface Props {
  deviceId: string;
  device?: any;
}

interface TaskItem {
  _id: string;
  name: string;
  device: string;
  timestamp?: string;
  status?: string;
  fault?: any;
}

interface MetricPoint {
  timestamp: string;
  bytesReceived?: number;
  bytesSent?: number;
  cpuUsage?: number;
  memoryUsage?: number;
  wifiClients?: number;
  uptime?: number;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function DeviceHistory({ deviceId, device: _device }: Props) {
  const toast = useToast();
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [metrics, setMetrics] = useState<MetricPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(24); // horas
  const [refreshing, setRefreshing] = useState(false);

  // Buscar tarefas do dispositivo
  const loadData = async () => {
    setLoading(true);
    try {
      // Buscar tarefas do GenieACS
      const tasksData = await getTasks({ device: deviceId });
      setTasks(Array.isArray(tasksData) ? tasksData : []);

      // Buscar métricas do backend
      const metricsResult = await getFeedsMetrics({
        device_id: deviceId,
        hours: period,
        limit: 1000,
      });
      
      if (metricsResult.metrics) {
        setMetrics(metricsResult.metrics.map((m: any) => ({
          timestamp: m.collected_at || new Date().toISOString(),
          bytesReceived: m.bytes_received,
          bytesSent: m.bytes_sent,
          cpuUsage: m.cpu_usage,
          memoryUsage: m.memory_usage,
          wifiClients: (m.wifi_clients_24ghz || 0) + (m.wifi_clients_5ghz || 0),
          uptime: m.uptime_seconds,
        })));
      }
    } catch (err) {
      console.error("Erro ao carregar histórico:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (deviceId) {
      loadData();
    }
  }, [deviceId, period]);

  const refresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
    toast({ title: "Dados atualizados", status: "success", duration: 2000 });
  };

  // Estatísticas de tarefas
  const taskStats = useMemo(() => {
    const total = tasks.length;
    const completed = tasks.filter(t => !t.fault).length;
    const failed = tasks.filter(t => t.fault).length;
    return { total, completed, failed };
  }, [tasks]);

  // Dados para gráficos
  const chartData = useMemo(() => {
    return metrics.slice(-100).map(m => ({
      ...m,
      time: new Date(m.timestamp).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      download: m.bytesReceived ? (m.bytesReceived / 1024 / 1024).toFixed(2) : 0,
      upload: m.bytesSent ? (m.bytesSent / 1024 / 1024).toFixed(2) : 0,
    }));
  }, [metrics]);

  const formatBytes = (bytes?: number) => {
    if (!bytes) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  };

  const formatUptime = (seconds?: number) => {
    if (!seconds) return "—";
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  if (loading) {
    return (
      <Box textAlign="center" py={10}>
        <Spinner size="xl" color="cyan.400" />
        <Text color="gray.400" mt={4}>Carregando histórico...</Text>
      </Box>
    );
  }

  return (
    <Box>
      {/* Header com controles */}
      <HStack justify="space-between" mb={6}>
        <HStack>
          <Icon as={FaHistory} color="cyan.400" />
          <Text fontWeight="bold" color="white">Histórico do Dispositivo</Text>
        </HStack>
        <HStack>
          <Select
            size="sm"
            value={period}
            onChange={(e) => setPeriod(Number(e.target.value))}
            bg="gray.700"
            border="none"
            w="150px"
          >
            <option value={6}>Últimas 6h</option>
            <option value={24}>Últimas 24h</option>
            <option value={72}>Últimos 3 dias</option>
            <option value={168}>Última semana</option>
          </Select>
          <Button
            size="sm"
            leftIcon={<FaSync />}
            onClick={refresh}
            isLoading={refreshing}
            variant="outline"
            colorScheme="cyan"
          >
            Atualizar
          </Button>
        </HStack>
      </HStack>

      <Tabs variant="soft-rounded" colorScheme="cyan" size="sm">
        <TabList mb={4}>
          <Tab>📊 Métricas</Tab>
          <Tab>📝 Tarefas ({taskStats.total})</Tab>
          <Tab>📈 Uso de Banda</Tab>
        </TabList>

        <TabPanels>
          {/* Métricas */}
          <TabPanel p={0}>
            {/* Stats resumo */}
            <SimpleGrid columns={{ base: 2, md: 4 }} spacing={4} mb={6}>
              <Stat bg="gray.700" p={3} borderRadius="lg">
                <StatLabel color="gray.400" fontSize="xs">
                  <HStack><Icon as={FaDownload} /><Text>Download Total</Text></HStack>
                </StatLabel>
                <StatNumber color="cyan.400" fontSize="lg">
                  {formatBytes(metrics.reduce((sum, m) => sum + (m.bytesReceived || 0), 0))}
                </StatNumber>
              </Stat>
              <Stat bg="gray.700" p={3} borderRadius="lg">
                <StatLabel color="gray.400" fontSize="xs">
                  <HStack><Icon as={FaUpload} /><Text>Upload Total</Text></HStack>
                </StatLabel>
                <StatNumber color="purple.400" fontSize="lg">
                  {formatBytes(metrics.reduce((sum, m) => sum + (m.bytesSent || 0), 0))}
                </StatNumber>
              </Stat>
              <Stat bg="gray.700" p={3} borderRadius="lg">
                <StatLabel color="gray.400" fontSize="xs">
                  <HStack><Icon as={FaWifi} /><Text>Clientes WiFi (Máx)</Text></HStack>
                </StatLabel>
                <StatNumber color="green.400" fontSize="lg">
                  {Math.max(...metrics.map(m => m.wifiClients || 0), 0)}
                </StatNumber>
              </Stat>
              <Stat bg="gray.700" p={3} borderRadius="lg">
                <StatLabel color="gray.400" fontSize="xs">
                  <HStack><Icon as={FaClock} /><Text>Uptime Atual</Text></HStack>
                </StatLabel>
                <StatNumber color="white" fontSize="lg">
                  {formatUptime(metrics[metrics.length - 1]?.uptime)}
                </StatNumber>
              </Stat>
            </SimpleGrid>

            {/* Gráfico de métricas */}
            {chartData.length > 0 ? (
              <Box bg="gray.800" p={4} borderRadius="xl" border="1px solid" borderColor="gray.700">
                <Text fontWeight="bold" color="white" mb={4}>Uso de Recursos</Text>
                <Box h="250px">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                      <XAxis dataKey="time" stroke="#888" fontSize={10} />
                      <YAxis stroke="#888" fontSize={10} />
                      <RechartsTooltip
                        contentStyle={{ backgroundColor: "#2D3748", border: "none" }}
                        labelStyle={{ color: "#fff" }}
                      />
                      <Line
                        type="monotone"
                        dataKey="cpuUsage"
                        stroke="#F56565"
                        name="CPU %"
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="memoryUsage"
                        stroke="#48BB78"
                        name="Memória %"
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="wifiClients"
                        stroke="#4299E1"
                        name="Clientes WiFi"
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </Box>
              </Box>
            ) : (
              <Box bg="gray.800" p={8} borderRadius="xl" textAlign="center">
                <Icon as={FaInfoCircle} boxSize={8} color="gray.500" mb={2} />
                <Text color="gray.400">
                  Nenhuma métrica coletada ainda. O sistema coletará dados automaticamente.
                </Text>
              </Box>
            )}
          </TabPanel>

          {/* Tarefas */}
          <TabPanel p={0}>
            {/* Stats de tarefas */}
            <SimpleGrid columns={3} spacing={4} mb={4}>
              <Stat bg="gray.700" p={3} borderRadius="lg">
                <StatLabel color="gray.400">Total</StatLabel>
                <StatNumber color="white">{taskStats.total}</StatNumber>
              </Stat>
              <Stat bg="gray.700" p={3} borderRadius="lg">
                <StatLabel color="gray.400">Sucesso</StatLabel>
                <StatNumber color="green.400">{taskStats.completed}</StatNumber>
              </Stat>
              <Stat bg="gray.700" p={3} borderRadius="lg">
                <StatLabel color="gray.400">Falhas</StatLabel>
                <StatNumber color="red.400">{taskStats.failed}</StatNumber>
              </Stat>
            </SimpleGrid>

            <Box bg="gray.800" p={4} borderRadius="xl" border="1px solid" borderColor="gray.700">
              {tasks.length > 0 ? (
                <Box overflowX="auto">
                  <Table size="sm">
                    <Thead>
                      <Tr>
                        <Th color="gray.400">Status</Th>
                        <Th color="gray.400">Tarefa</Th>
                        <Th color="gray.400">Data/Hora</Th>
                        <Th color="gray.400">Detalhes</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {tasks.slice(0, 50).map((task) => (
                        <Tr key={task._id}>
                          <Td>
                            {task.fault ? (
                              <Badge colorScheme="red">
                                <HStack spacing={1}>
                                  <Icon as={FaTimes} />
                                  <Text>Falha</Text>
                                </HStack>
                              </Badge>
                            ) : (
                              <Badge colorScheme="green">
                                <HStack spacing={1}>
                                  <Icon as={FaCheck} />
                                  <Text>OK</Text>
                                </HStack>
                              </Badge>
                            )}
                          </Td>
                          <Td>
                            <Code colorScheme="blue" fontSize="xs">{task.name}</Code>
                          </Td>
                          <Td>
                            <Text fontSize="sm" color="gray.300">
                              {task.timestamp
                                ? new Date(task.timestamp).toLocaleString("pt-BR")
                                : "—"
                              }
                            </Text>
                          </Td>
                          <Td>
                            {task.fault && (
                              <Tooltip label={JSON.stringify(task.fault)}>
                                <Badge colorScheme="red" cursor="help">
                                  <HStack spacing={1}>
                                    <Icon as={FaExclamationTriangle} />
                                    <Text>Ver erro</Text>
                                  </HStack>
                                </Badge>
                              </Tooltip>
                            )}
                          </Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                </Box>
              ) : (
                <Box textAlign="center" py={8}>
                  <Icon as={FaHistory} boxSize={8} color="gray.500" mb={2} />
                  <Text color="gray.400">Nenhuma tarefa registrada</Text>
                </Box>
              )}
            </Box>
          </TabPanel>

          {/* Uso de Banda */}
          <TabPanel p={0}>
            <Box bg="gray.800" p={4} borderRadius="xl" border="1px solid" borderColor="gray.700">
              <Text fontWeight="bold" color="white" mb={4}>Tráfego de Dados</Text>
              
              {chartData.length > 0 ? (
                <Box h="300px">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                      <XAxis dataKey="time" stroke="#888" fontSize={10} />
                      <YAxis stroke="#888" fontSize={10} unit=" MB" />
                      <RechartsTooltip
                        contentStyle={{ backgroundColor: "#2D3748", border: "none" }}
                        labelStyle={{ color: "#fff" }}
                        formatter={(value: any) => [`${value} MB`]}
                      />
                      <Area
                        type="monotone"
                        dataKey="download"
                        stroke="#00B5D8"
                        fill="#00B5D8"
                        fillOpacity={0.3}
                        name="Download"
                      />
                      <Area
                        type="monotone"
                        dataKey="upload"
                        stroke="#9F7AEA"
                        fill="#9F7AEA"
                        fillOpacity={0.3}
                        name="Upload"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </Box>
              ) : (
                <Box textAlign="center" py={8}>
                  <Icon as={FaInfoCircle} boxSize={8} color="gray.500" mb={2} />
                  <Text color="gray.400">
                    Dados de tráfego serão exibidos conforme as métricas forem coletadas
                  </Text>
                </Box>
              )}
            </Box>
          </TabPanel>
        </TabPanels>
      </Tabs>
    </Box>
  );
}
