// components/MLDashboard.tsx
// Dashboard de Machine Learning e Análise Preditiva

import React, { useEffect, useState } from 'react';
import {
  Box,
  Card,
  CardHeader,
  CardBody,
  Heading,
  Text,
  Badge,
  Flex,
  Grid,
  Spinner,
  Progress,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Icon,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
  VStack,
  HStack,
  useColorModeValue,
  Tooltip,
  Divider,
} from '@chakra-ui/react';
import {
  FiActivity,
  FiAlertTriangle,
  FiCheckCircle,
  FiTrendingDown,
  FiThermometer,
  FiShield,
} from 'react-icons/fi';
import { FaBrain } from 'react-icons/fa';
import { mlApi } from '../services/apiConfig';

// Interfaces
interface DeviceHealth {
  device_id: string;
  health_score: number;
  risk_level: string;
  risk_score: number;
  anomalies: Anomaly[];
  risk_factors: RiskFactor[];
  recommendations: Recommendation[];
  analysis: {
    anomaly_period_hours: number;
    risk_period_days: number;
    anomaly_samples: number;
    risk_samples: number;
  };
}

interface Anomaly {
  metric: string;
  value: number;
  threshold?: number;
  zscore?: number;
  severity: string;
  message: string;
}

interface RiskFactor {
  factor: string;
  weight: number;
  message: string;
  trend?: string;
  reboots?: number;
  count?: number;
}

interface Recommendation {
  priority: string;
  category: string;
  title: string;
  description: string;
  action: string;
}

interface BatchHealthResult {
  device_id: string;
  manufacturer: string;
  model: string;
  pppoe_login: string;
  wan_ip: string | null;
  health_score: number;
  anomaly_count: number;
  anomalies: Anomaly[];
}

interface BatchHealthResponse {
  devices_analyzed: number;
  problems_found: number;
  results: BatchHealthResult[];
  timestamp: string;
}

interface FleetAnalysis {
  summary: {
    total_devices: number;
    online: number;
    offline: number;
    online_percentage: number;
  };
  by_manufacturer: { name: string; count: number }[];
  by_model: { name: string; count: number }[];
}

// Props
interface MLDashboardProps {
  deviceId?: string;  // Opcional - se fornecido, mostra análise individual
}

// Componente principal
const MLDashboard: React.FC<MLDashboardProps> = ({ deviceId }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deviceHealth, setDeviceHealth] = useState<DeviceHealth | null>(null);
  const [batchHealth, setBatchHealth] = useState<BatchHealthResponse | null>(null);
  const [fleetAnalysis, setFleetAnalysis] = useState<FleetAnalysis | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        if (deviceId) {
          // Análise individual
          const res = await fetch(mlApi(`/health/${deviceId}`));
          if (!res.ok) throw new Error('Erro ao carregar análise do dispositivo');
          setDeviceHealth(await res.json());
        } else {
          // Análise da frota
          const [batchRes, fleetRes] = await Promise.all([
            fetch(mlApi('/batch/health?limit=20')),
            fetch(mlApi('/fleet'))
          ]);
          
          if (!batchRes.ok || !fleetRes.ok) {
            throw new Error('Erro ao carregar análise da frota');
          }
          
          setBatchHealth(await batchRes.json());
          setFleetAnalysis(await fleetRes.json());
        }
      } catch (err: any) {
        setError(err.message || 'Erro desconhecido');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 60000); // Atualiza a cada minuto
    return () => clearInterval(interval);
  }, [deviceId]);

  if (loading) {
    return (
      <Flex justify="center" align="center" h="400px">
        <Spinner size="xl" color="blue.500" thickness="4px" />
      </Flex>
    );
  }

  if (error) {
    return (
      <Alert status="error" borderRadius="lg">
        <AlertIcon />
        <AlertTitle>Erro!</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  // Renderização individual do dispositivo
  if (deviceId && deviceHealth) {
    return <DeviceMLAnalysis health={deviceHealth} />;
  }

  // Renderização da frota
  return (
    <FleetMLDashboard 
      batchHealth={batchHealth!} 
      fleetAnalysis={fleetAnalysis!} 
    />
  );
};

// Componente de análise individual
const DeviceMLAnalysis: React.FC<{ health: DeviceHealth }> = ({ health }) => {
  const cardBg = useColorModeValue('white', 'gray.800');
  
  const getHealthColor = (score: number) => {
    if (score >= 80) return 'green';
    if (score >= 60) return 'yellow';
    if (score >= 40) return 'orange';
    return 'red';
  };

  const getRiskBadge = (level: string) => {
    const colors: Record<string, string> = {
      minimal: 'green',
      low: 'blue',
      medium: 'yellow',
      high: 'orange',
      critical: 'red'
    };
    return colors[level] || 'gray';
  };

  return (
    <VStack spacing={4} align="stretch">
      {/* Header com Health Score */}
      <Card bg={cardBg}>
        <CardBody>
          <Grid templateColumns={{ base: '1fr', md: 'repeat(3, 1fr)' }} gap={6}>
            {/* Health Score Gauge */}
            <Flex direction="column" align="center">
              <Icon as={FaBrain} boxSize={8} color="purple.500" mb={2} />
              <Text fontSize="sm" color="gray.500">Health Score</Text>
              <Text fontSize="4xl" fontWeight="bold" color={`${getHealthColor(health.health_score)}.500`}>
                {health.health_score}
              </Text>
              <Progress 
                value={health.health_score} 
                colorScheme={getHealthColor(health.health_score)}
                w="100%"
                borderRadius="full"
                size="lg"
              />
            </Flex>

            {/* Risk Level */}
            <Flex direction="column" align="center">
              <Icon as={FiShield} boxSize={8} color="blue.500" mb={2} />
              <Text fontSize="sm" color="gray.500">Nível de Risco</Text>
              <Badge 
                fontSize="xl" 
                colorScheme={getRiskBadge(health.risk_level)}
                px={4}
                py={2}
                borderRadius="full"
                textTransform="capitalize"
              >
                {health.risk_level}
              </Badge>
              <Text fontSize="sm" mt={2}>Score: {health.risk_score}/100</Text>
            </Flex>

            {/* Analysis Info */}
            <Flex direction="column" align="center">
              <Icon as={FiActivity} boxSize={8} color="green.500" mb={2} />
              <Text fontSize="sm" color="gray.500">Amostras Analisadas</Text>
              <Text fontSize="2xl" fontWeight="bold">{health.analysis.anomaly_samples}</Text>
              <Text fontSize="xs" color="gray.500">
                Últimas {health.analysis.anomaly_period_hours}h
              </Text>
            </Flex>
          </Grid>
        </CardBody>
      </Card>

      {/* Anomalias */}
      {health.anomalies.length > 0 && (
        <Card bg={cardBg}>
          <CardHeader pb={2}>
            <HStack>
              <Icon as={FiAlertTriangle} color="orange.500" />
              <Heading size="sm">Anomalias Detectadas</Heading>
              <Badge colorScheme="orange">{health.anomalies.length}</Badge>
            </HStack>
          </CardHeader>
          <CardBody pt={0}>
            <VStack spacing={3} align="stretch">
              {health.anomalies.map((anomaly, idx) => (
                <Alert 
                  key={idx} 
                  status={anomaly.severity === 'warning' ? 'warning' : 'error'}
                  borderRadius="md"
                  size="sm"
                >
                  <AlertIcon />
                  <Box flex="1">
                    <AlertTitle fontSize="sm">{anomaly.metric}</AlertTitle>
                    <AlertDescription fontSize="xs">
                      {anomaly.message}
                      {anomaly.zscore && (
                        <Badge ml={2} colorScheme="purple" size="sm">
                          Z-Score: {anomaly.zscore.toFixed(2)}
                        </Badge>
                      )}
                    </AlertDescription>
                  </Box>
                  <Text fontWeight="bold" fontSize="sm">
                    {typeof anomaly.value === 'number' ? anomaly.value.toFixed(2) : anomaly.value}
                  </Text>
                </Alert>
              ))}
            </VStack>
          </CardBody>
        </Card>
      )}

      {/* Fatores de Risco */}
      {health.risk_factors.length > 0 && (
        <Card bg={cardBg}>
          <CardHeader pb={2}>
            <HStack>
              <Icon as={FiTrendingDown} color="red.500" />
              <Heading size="sm">Fatores de Risco</Heading>
            </HStack>
          </CardHeader>
          <CardBody pt={0}>
            <Table size="sm" variant="simple">
              <Thead>
                <Tr>
                  <Th>Fator</Th>
                  <Th>Mensagem</Th>
                  <Th isNumeric>Peso</Th>
                </Tr>
              </Thead>
              <Tbody>
                {health.risk_factors.map((factor, idx) => (
                  <Tr key={idx}>
                    <Td fontWeight="medium">{factor.factor}</Td>
                    <Td fontSize="sm" color="gray.600">{factor.message}</Td>
                    <Td isNumeric>
                      <Badge colorScheme={factor.weight > 20 ? 'red' : 'yellow'}>
                        +{factor.weight}
                      </Badge>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </CardBody>
        </Card>
      )}

      {/* Recomendações */}
      {health.recommendations.length > 0 && (
        <Card bg={cardBg}>
          <CardHeader pb={2}>
            <HStack>
              <Icon as={FiCheckCircle} color="green.500" />
              <Heading size="sm">Recomendações IA</Heading>
            </HStack>
          </CardHeader>
          <CardBody pt={0}>
            <VStack spacing={3} align="stretch">
              {health.recommendations.map((rec, idx) => (
                <Box 
                  key={idx} 
                  p={3} 
                  bg={useColorModeValue('gray.50', 'gray.700')}
                  borderRadius="md"
                  borderLeft="4px solid"
                  borderLeftColor={
                    rec.priority === 'alta' ? 'red.500' : 
                    rec.priority === 'media' ? 'orange.500' : 'blue.500'
                  }
                >
                  <HStack mb={1}>
                    <Badge colorScheme={
                      rec.priority === 'alta' ? 'red' : 
                      rec.priority === 'media' ? 'orange' : 'blue'
                    }>
                      {rec.priority}
                    </Badge>
                    <Badge variant="outline">{rec.category}</Badge>
                  </HStack>
                  <Text fontWeight="bold" fontSize="sm">{rec.title}</Text>
                  <Text fontSize="xs" color="gray.600">{rec.description}</Text>
                  <Text fontSize="xs" color="blue.500" mt={1}>
                    💡 {rec.action}
                  </Text>
                </Box>
              ))}
            </VStack>
          </CardBody>
        </Card>
      )}

      {/* Sem problemas */}
      {health.anomalies.length === 0 && health.risk_factors.length === 0 && (
        <Alert status="success" borderRadius="lg">
          <AlertIcon />
          <Box>
            <AlertTitle>Dispositivo Saudável!</AlertTitle>
            <AlertDescription>
              Nenhuma anomalia detectada nas últimas {health.analysis.anomaly_period_hours} horas.
              Todos os indicadores estão dentro dos parâmetros normais.
            </AlertDescription>
          </Box>
        </Alert>
      )}
    </VStack>
  );
};

// Componente do dashboard da frota
const FleetMLDashboard: React.FC<{
  batchHealth: BatchHealthResponse;
  fleetAnalysis: FleetAnalysis;
}> = ({ batchHealth, fleetAnalysis }) => {
  const cardBg = useColorModeValue('white', 'gray.800');

  const getHealthColor = (score: number) => {
    if (score >= 80) return 'green';
    if (score >= 60) return 'yellow';
    if (score >= 40) return 'orange';
    return 'red';
  };

  // Calcular estatísticas
  const healthyDevices = batchHealth.results.filter(d => d.health_score >= 80).length;
  const warningDevices = batchHealth.results.filter(d => d.health_score >= 60 && d.health_score < 80).length;
  const criticalDevices = batchHealth.results.filter(d => d.health_score < 60).length;
  const avgHealthScore = Math.round(
    batchHealth.results.reduce((sum, d) => sum + d.health_score, 0) / batchHealth.results.length
  );

  return (
    <VStack spacing={4} align="stretch">
      {/* Header */}
      <Card bg={cardBg}>
        <CardHeader>
          <HStack>
            <Icon as={FaBrain} boxSize={6} color="purple.500" />
            <Heading size="md">Dashboard de Inteligência Artificial</Heading>
          </HStack>
          <Text fontSize="sm" color="gray.500" mt={1}>
            Análise preditiva e detecção de anomalias em tempo real
          </Text>
        </CardHeader>
      </Card>

      {/* Stats Cards */}
      <Grid templateColumns={{ base: '1fr', md: 'repeat(4, 1fr)' }} gap={4}>
        <Card bg={cardBg}>
          <CardBody>
            <Stat>
              <StatLabel>
                <HStack>
                  <Icon as={FiActivity} color="blue.500" />
                  <Text>Dispositivos Analisados</Text>
                </HStack>
              </StatLabel>
              <StatNumber>{batchHealth.devices_analyzed}</StatNumber>
              <StatHelpText>
                {fleetAnalysis.summary.online} online / {fleetAnalysis.summary.offline} offline
              </StatHelpText>
            </Stat>
          </CardBody>
        </Card>

        <Card bg={cardBg}>
          <CardBody>
            <Stat>
              <StatLabel>
                <HStack>
                  <Icon as={FiThermometer} color="green.500" />
                  <Text>Health Score Médio</Text>
                </HStack>
              </StatLabel>
              <StatNumber color={`${getHealthColor(avgHealthScore)}.500`}>
                {avgHealthScore}%
              </StatNumber>
              <StatHelpText>
                <Progress 
                  value={avgHealthScore} 
                  colorScheme={getHealthColor(avgHealthScore)}
                  size="sm"
                  borderRadius="full"
                />
              </StatHelpText>
            </Stat>
          </CardBody>
        </Card>

        <Card bg={cardBg}>
          <CardBody>
            <Stat>
              <StatLabel>
                <HStack>
                  <Icon as={FiAlertTriangle} color="orange.500" />
                  <Text>Problemas Detectados</Text>
                </HStack>
              </StatLabel>
              <StatNumber color={batchHealth.problems_found > 0 ? 'orange.500' : 'green.500'}>
                {batchHealth.problems_found}
              </StatNumber>
              <StatHelpText>
                {criticalDevices} críticos / {warningDevices} em alerta
              </StatHelpText>
            </Stat>
          </CardBody>
        </Card>

        <Card bg={cardBg}>
          <CardBody>
            <Stat>
              <StatLabel>
                <HStack>
                  <Icon as={FiCheckCircle} color="green.500" />
                  <Text>Dispositivos Saudáveis</Text>
                </HStack>
              </StatLabel>
              <StatNumber color="green.500">{healthyDevices}</StatNumber>
              <StatHelpText>
                {((healthyDevices / batchHealth.devices_analyzed) * 100).toFixed(0)}% da frota
              </StatHelpText>
            </Stat>
          </CardBody>
        </Card>
      </Grid>

      {/* Tabela de Status */}
      <Card bg={cardBg}>
        <CardHeader pb={2}>
          <HStack justify="space-between">
            <Heading size="sm">Status dos Dispositivos (Top 20)</Heading>
            <Text fontSize="xs" color="gray.500">
              Atualizado: {new Date(batchHealth.timestamp).toLocaleTimeString('pt-BR')}
            </Text>
          </HStack>
        </CardHeader>
        <CardBody pt={0} overflowX="auto">
          <Table size="sm" variant="simple">
            <Thead>
              <Tr>
                <Th>PPPoE / Device</Th>
                <Th>Modelo</Th>
                <Th>WAN IP</Th>
                <Th isNumeric>Health</Th>
                <Th isNumeric>Anomalias</Th>
                <Th>Status</Th>
              </Tr>
            </Thead>
            <Tbody>
              {batchHealth.results.map((device) => (
                <Tr key={device.device_id}>
                  <Td>
                    <Text fontWeight="medium" fontSize="sm">
                      {device.pppoe_login || device.device_id.substring(0, 20)}
                    </Text>
                    <Text fontSize="xs" color="gray.500">{device.manufacturer}</Text>
                  </Td>
                  <Td fontSize="sm">{device.model}</Td>
                  <Td fontSize="sm">
                    {device.wan_ip || (
                      <Badge colorScheme="gray" size="sm">Sem IP</Badge>
                    )}
                  </Td>
                  <Td isNumeric>
                    <Badge 
                      colorScheme={getHealthColor(device.health_score)}
                      fontSize="sm"
                    >
                      {device.health_score}%
                    </Badge>
                  </Td>
                  <Td isNumeric>
                    {device.anomaly_count > 0 ? (
                      <Tooltip 
                        label={device.anomalies.map(a => a.message).join(', ')}
                        hasArrow
                      >
                        <Badge colorScheme="orange">{device.anomaly_count}</Badge>
                      </Tooltip>
                    ) : (
                      <Badge colorScheme="green">0</Badge>
                    )}
                  </Td>
                  <Td>
                    {device.health_score >= 80 ? (
                      <HStack spacing={1}>
                        <Icon as={FiCheckCircle} color="green.500" />
                        <Text fontSize="xs" color="green.500">OK</Text>
                      </HStack>
                    ) : device.health_score >= 60 ? (
                      <HStack spacing={1}>
                        <Icon as={FiAlertTriangle} color="yellow.500" />
                        <Text fontSize="xs" color="yellow.500">Alerta</Text>
                      </HStack>
                    ) : (
                      <HStack spacing={1}>
                        <Icon as={FiAlertTriangle} color="red.500" />
                        <Text fontSize="xs" color="red.500">Crítico</Text>
                      </HStack>
                    )}
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </CardBody>
      </Card>

      {/* Distribuição por Fabricante */}
      <Grid templateColumns={{ base: '1fr', md: 'repeat(2, 1fr)' }} gap={4}>
        <Card bg={cardBg}>
          <CardHeader pb={2}>
            <Heading size="sm">Distribuição por Fabricante</Heading>
          </CardHeader>
          <CardBody pt={0}>
            <VStack spacing={2} align="stretch">
              {fleetAnalysis.by_manufacturer
                .filter(m => m.name !== 'DISCOVERYSERVICE')
                .slice(0, 6)
                .map((manufacturer) => (
                  <Flex key={manufacturer.name} justify="space-between" align="center">
                    <Text fontSize="sm">{manufacturer.name}</Text>
                    <HStack>
                      <Progress 
                        value={(manufacturer.count / fleetAnalysis.summary.total_devices) * 100}
                        w="100px"
                        size="sm"
                        colorScheme="blue"
                        borderRadius="full"
                      />
                      <Badge>{manufacturer.count}</Badge>
                    </HStack>
                  </Flex>
                ))}
            </VStack>
          </CardBody>
        </Card>

        <Card bg={cardBg}>
          <CardHeader pb={2}>
            <Heading size="sm">Resumo de Saúde da Frota</Heading>
          </CardHeader>
          <CardBody pt={0}>
            <VStack spacing={3} align="stretch">
              <Flex justify="space-between" align="center">
                <HStack>
                  <Box w={3} h={3} bg="green.500" borderRadius="full" />
                  <Text fontSize="sm">Saudáveis (≥80%)</Text>
                </HStack>
                <Badge colorScheme="green" fontSize="md">{healthyDevices}</Badge>
              </Flex>
              <Flex justify="space-between" align="center">
                <HStack>
                  <Box w={3} h={3} bg="yellow.500" borderRadius="full" />
                  <Text fontSize="sm">Em Alerta (60-79%)</Text>
                </HStack>
                <Badge colorScheme="yellow" fontSize="md">{warningDevices}</Badge>
              </Flex>
              <Flex justify="space-between" align="center">
                <HStack>
                  <Box w={3} h={3} bg="red.500" borderRadius="full" />
                  <Text fontSize="sm">Críticos (&lt;60%)</Text>
                </HStack>
                <Badge colorScheme="red" fontSize="md">{criticalDevices}</Badge>
              </Flex>
              <Divider />
              <Flex justify="space-between" align="center">
                <Text fontWeight="bold" fontSize="sm">Uptime Médio</Text>
                <Text fontSize="sm" color="gray.600">
                  {fleetAnalysis.summary.online_percentage.toFixed(1)}%
                </Text>
              </Flex>
            </VStack>
          </CardBody>
        </Card>
      </Grid>

      {/* Alertas de IA */}
      <Alert status="info" borderRadius="lg" variant="left-accent">
        <AlertIcon as={FaBrain} />
        <Box>
          <AlertTitle>Análise Preditiva Ativa</AlertTitle>
          <AlertDescription fontSize="sm">
            O sistema está monitorando {fleetAnalysis.summary.total_devices} dispositivos 
            usando algoritmos de detecção de anomalias baseados em Z-Score e IQR.
            Métricas coletadas a cada 5 minutos são analisadas para detectar padrões anormais.
          </AlertDescription>
        </Box>
      </Alert>
    </VStack>
  );
};

export default MLDashboard;
