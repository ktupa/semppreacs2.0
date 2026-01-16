// src/pages/Dashboard.tsx - Dashboard Limpa e Organizada
import {
  Box,
  SimpleGrid,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  HStack,
  VStack,
  Text,
  Icon,
  Badge,
  Progress,
  Spinner,
  Button,
  Tooltip,
  Tabs,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
} from "@chakra-ui/react";
import { useEffect, useState, useMemo } from "react";
import {
  FaWifi,
  FaSync,
  FaRobot,
  FaTasks,
  FaBell,
} from "react-icons/fa";
import { MdRouter, MdSignalWifiOff } from "react-icons/md";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
} from "recharts";
import { getDevices, getFeedsSummary, getDashboardOverview } from "../services/genieAcsApi";

// Componentes
import AlertasRecentes from "../components/AlertasRecentes";
import TarefasErros from "../components/TarefasErros";
import AnomaliasFeedback from "../components/AnomaliasFeedback";
import TopModelos from "../components/TopModelos";

interface DeviceStats {
  total: number;
  online: number;
  offline: number;
  percentage: number;
}

interface ManufacturerCount {
  name: string;
  count: number;
  color: string;
}

const COLORS = ["#00B5D8", "#9F7AEA", "#48BB78", "#ED8936", "#FC8181", "#63B3ED"];

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [devices, setDevices] = useState<any[]>([]);
  const [feedsSummary, setFeedsSummary] = useState<any>(null);
  const [aiOverview, setAiOverview] = useState<any>(null);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  const loadData = async () => {
    try {
      const [devicesData, summaryData, overviewData] = await Promise.all([
        getDevices(),
        getFeedsSummary(24),
        getDashboardOverview(),
      ]);
      setDevices(Array.isArray(devicesData) ? devicesData : []);
      setFeedsSummary(summaryData);
      setAiOverview(overviewData);
      setLastUpdate(new Date());
    } catch (err) {
      console.error("Erro ao carregar dashboard:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 60000);
    return () => clearInterval(interval);
  }, []);

  const refresh = () => {
    setRefreshing(true);
    loadData();
  };

  // Calcular estatísticas
  const deviceStats = useMemo<DeviceStats>(() => {
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;
    const online = devices.filter(d => {
      if (!d._lastInform) return false;
      return (now - new Date(d._lastInform).getTime()) < fiveMinutes;
    }).length;
    const total = devices.length;
    const offline = total - online;
    const percentage = total > 0 ? Math.round((online / total) * 100) : 0;
    return { total, online, offline, percentage };
  }, [devices]);

  // Agrupar por fabricante
  const manufacturerStats = useMemo<ManufacturerCount[]>(() => {
    const counts: Record<string, number> = {};
    devices.forEach(d => {
      const manufacturer = d._deviceId?._Manufacturer || "Desconhecido";
      counts[manufacturer] = (counts[manufacturer] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, count], idx) => ({ name, count, color: COLORS[idx % COLORS.length] }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [devices]);

  if (loading) {
    return (
      <Box bg="gray.900" minH="100vh" display="flex" alignItems="center" justifyContent="center">
        <VStack>
          <Spinner size="xl" color="cyan.400" />
          <Text color="gray.400">Carregando dashboard...</Text>
        </VStack>
      </Box>
    );
  }

  return (
    <Box bg="gray.900" px={6} py={4} minH="100vh" color="white">
      {/* Header compacto */}
      <HStack justify="space-between" mb={6}>
        <HStack spacing={3}>
          <Icon as={MdRouter} boxSize={6} color="cyan.400" />
          <Text fontSize="xl" fontWeight="bold">Dashboard</Text>
          <Badge colorScheme="cyan" fontSize="xs">Semppre ACS</Badge>
        </HStack>
        <HStack spacing={4}>
          <Text fontSize="xs" color="gray.500">
            {lastUpdate.toLocaleTimeString("pt-BR")}
          </Text>
          <Tooltip label="Atualizar dados">
            <Button
              size="sm"
              variant="ghost"
              leftIcon={<FaSync />}
              onClick={refresh}
              isLoading={refreshing}
              colorScheme="cyan"
            >
              Atualizar
            </Button>
          </Tooltip>
        </HStack>
      </HStack>

      {/* Cards principais */}
      <SimpleGrid columns={{ base: 2, md: 4, lg: 6 }} spacing={4} mb={6}>
        <Box bg="gray.800" p={4} borderRadius="xl" borderLeft="4px solid" borderLeftColor="cyan.500">
          <Stat>
            <StatLabel color="gray.400" fontSize="xs">Total CPEs</StatLabel>
            <StatNumber fontSize="2xl">{deviceStats.total}</StatNumber>
            <StatHelpText mb={0}>
              <Progress value={100} size="xs" colorScheme="cyan" borderRadius="full" />
            </StatHelpText>
          </Stat>
        </Box>

        <Box bg="gray.800" p={4} borderRadius="xl" borderLeft="4px solid" borderLeftColor="green.500">
          <Stat>
            <StatLabel color="gray.400" fontSize="xs">
              <HStack><Icon as={FaWifi} boxSize={3} /><Text>Online</Text></HStack>
            </StatLabel>
            <StatNumber fontSize="2xl" color="green.400">{deviceStats.online}</StatNumber>
            <StatHelpText mb={0}>
              <Badge colorScheme="green">{deviceStats.percentage}%</Badge>
            </StatHelpText>
          </Stat>
        </Box>

        <Box bg="gray.800" p={4} borderRadius="xl" borderLeft="4px solid" borderLeftColor="red.500">
          <Stat>
            <StatLabel color="gray.400" fontSize="xs">
              <HStack><Icon as={MdSignalWifiOff} boxSize={3} /><Text>Offline</Text></HStack>
            </StatLabel>
            <StatNumber fontSize="2xl" color="red.400">{deviceStats.offline}</StatNumber>
            <StatHelpText mb={0}>
              <Badge colorScheme="red">{100 - deviceStats.percentage}%</Badge>
            </StatHelpText>
          </Stat>
        </Box>

        <Box bg="gray.800" p={4} borderRadius="xl" borderLeft="4px solid" borderLeftColor="orange.500">
          <Stat>
            <StatLabel color="gray.400" fontSize="xs">
              <HStack><Icon as={FaBell} boxSize={3} /><Text>Alertas</Text></HStack>
            </StatLabel>
            <StatNumber fontSize="2xl" color="orange.400">
              {feedsSummary?.alerts?.active || 0}
            </StatNumber>
            <StatHelpText mb={0}><Text fontSize="xs" color="gray.500">24h</Text></StatHelpText>
          </Stat>
        </Box>

        <Box bg="gray.800" p={4} borderRadius="xl" borderLeft="4px solid" borderLeftColor="purple.500">
          <Stat>
            <StatLabel color="gray.400" fontSize="xs">
              <HStack><Icon as={FaTasks} boxSize={3} /><Text>Tarefas</Text></HStack>
            </StatLabel>
            <StatNumber fontSize="2xl" color="purple.400">
              {feedsSummary?.tasks?.pending || 0}
            </StatNumber>
            <StatHelpText mb={0}><Text fontSize="xs" color="gray.500">pendentes</Text></StatHelpText>
          </Stat>
        </Box>

        <Box bg="gray.800" p={4} borderRadius="xl" borderLeft="4px solid" borderLeftColor="blue.500">
          <Stat>
            <StatLabel color="gray.400" fontSize="xs">
              <HStack><Icon as={FaRobot} boxSize={3} /><Text>Saúde</Text></HStack>
            </StatLabel>
            <StatNumber fontSize="2xl" color="blue.400">
              {aiOverview?.health_summary
                ? Math.round(
                    ((aiOverview.health_summary.excellent || 0) * 100 +
                     (aiOverview.health_summary.good || 0) * 75) /
                    Math.max(deviceStats.total, 1)
                  )
                : 85}%
            </StatNumber>
            <StatHelpText mb={0}><Badge colorScheme="blue">IA</Badge></StatHelpText>
          </Stat>
        </Box>
      </SimpleGrid>

      {/* Tabs de conteúdo */}
      <Tabs variant="soft-rounded" colorScheme="cyan" size="sm">
        <TabList mb={4} bg="gray.800" p={2} borderRadius="xl" flexWrap="wrap">
          <Tab>📊 Visão Geral</Tab>
          <Tab>🔔 Alertas</Tab>
          <Tab>📝 Tarefas</Tab>
          <Tab>🤖 IA & Anomalias</Tab>
        </TabList>

        <TabPanels>
          <TabPanel p={0}>
            <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={4}>
              <Box bg="gray.800" p={4} borderRadius="xl">
                <Text fontWeight="bold" mb={4}>📱 Por Fabricante</Text>
                <HStack spacing={4}>
                  <Box w="150px" h="150px">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={manufacturerStats}
                          dataKey="count"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={40}
                          outerRadius={70}
                        >
                          {manufacturerStats.map((entry, idx) => (
                            <Cell key={idx} fill={entry.color} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </Box>
                  <VStack align="stretch" flex={1} spacing={2}>
                    {manufacturerStats.map((m, idx) => (
                      <HStack key={idx} justify="space-between">
                        <HStack>
                          <Box w={3} h={3} bg={m.color} borderRadius="sm" />
                          <Text fontSize="sm" color="gray.300">{m.name}</Text>
                        </HStack>
                        <Badge>{m.count}</Badge>
                      </HStack>
                    ))}
                  </VStack>
                </HStack>
              </Box>
              <Box bg="gray.800" p={4} borderRadius="xl">
                <TopModelos limit={5} sinceMinutes={10080} />
              </Box>
            </SimpleGrid>
          </TabPanel>

          <TabPanel p={0}>
            <Box bg="gray.800" p={4} borderRadius="xl">
              <AlertasRecentes maxItems={10} showSummary={true} />
            </Box>
          </TabPanel>

          <TabPanel p={0}>
            <Box bg="gray.800" p={4} borderRadius="xl">
              <TarefasErros />
            </Box>
          </TabPanel>

          <TabPanel p={0}>
            <Box bg="gray.800" p={4} borderRadius="xl">
              <AnomaliasFeedback maxItems={8} autoRefresh={120} />
            </Box>
          </TabPanel>
        </TabPanels>
      </Tabs>

      <HStack justify="center" mt={6} color="gray.600" fontSize="xs">
        <Text>Semppre ACS v1.3.0</Text>
        <Text>•</Text>
        <Text>{devices.length} dispositivos</Text>
      </HStack>
    </Box>
  );
}
