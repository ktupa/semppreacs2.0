// src/components/AnomaliasFeedback.tsx
/**
 * Componente de Anomalias com:
 * - Links diretos para dispositivos
 * - Orientações de correção
 * - Sistema de feedback para ML
 */

import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  VStack,
  HStack,
  Text,
  Badge,
  Button,
  IconButton,
  Tooltip,
  Spinner,
  Alert,
  AlertIcon,
  Collapse,
  useToast,
  Divider,
  Progress,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  Textarea,
  RadioGroup,
  Radio,
  Stack,
  Icon,
  Link,
} from "@chakra-ui/react";
import {
  ExternalLinkIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  RepeatIcon,
  InfoIcon,
} from "@chakra-ui/icons";
import {
  FaThumbsUp,
  FaThumbsDown,
  FaLightbulb,
  FaTools,
  FaExclamationTriangle,
  FaNetworkWired,
  FaWifi,
  FaMemory,
  FaMicrochip,
  FaClock,
} from "react-icons/fa";
import axios from "axios";

// =============== TYPES ===============

interface Anomaly {
  anomaly_type: string;
  device_id: string;
  timestamp: string;
  severity: number;
  description: string;
  affected_metrics: string[];
  recommended_actions: string[];
}

interface FeedbackData {
  event_type: string;
  device_id: string | null;
  feedback: "positive" | "negative" | "neutral";
  context: {
    anomaly_type?: string;
    severity?: number;
    description?: string;
    user_comment?: string;
    was_helpful?: boolean;
    action_taken?: string;
  };
}

// =============== ORIENTAÇÕES DE CORREÇÃO ===============

const CORRECTION_GUIDES: Record<string, {
  title: string;
  icon: React.ElementType;
  color: string;
  steps: string[];
  autoFix?: string;
}> = {
  latency_spike: {
    title: "Pico de Latência",
    icon: FaClock,
    color: "orange",
    steps: [
      "1. Verifique se há downloads/uploads pesados no dispositivo",
      "2. Analise o uso de banda no período do pico",
      "3. Verifique interferência WiFi se for conexão sem fio",
      "4. Considere reiniciar o dispositivo se persistir",
      "5. Verifique a qualidade do cabo/fibra se for conexão cabeada",
    ],
    autoFix: "Reboot do dispositivo",
  },
  packet_loss_burst: {
    title: "Perda de Pacotes",
    icon: FaNetworkWired,
    color: "red",
    steps: [
      "1. Verifique a qualidade do sinal WiFi (RSSI > -70 dBm)",
      "2. Analise possíveis interferências no canal WiFi",
      "3. Verifique cabos e conexões físicas",
      "4. Teste a conexão WAN do provedor",
      "5. Considere trocar o canal WiFi ou usar banda 5GHz",
    ],
    autoFix: "Trocar canal WiFi automaticamente",
  },
  high_cpu: {
    title: "CPU Elevada",
    icon: FaMicrochip,
    color: "yellow",
    steps: [
      "1. Verifique número de dispositivos conectados",
      "2. Analise se há processos travados no roteador",
      "3. Verifique se firmware está atualizado",
      "4. Considere reiniciar o dispositivo",
      "5. Avalie necessidade de upgrade do equipamento",
    ],
    autoFix: "Reboot do dispositivo",
  },
  high_memory: {
    title: "Memória Elevada",
    icon: FaMemory,
    color: "purple",
    steps: [
      "1. Verifique tabela de hosts conectados",
      "2. Limpe cache/logs do dispositivo",
      "3. Reinicie o dispositivo para liberar memória",
      "4. Verifique se há vazamento de memória (firmware)",
      "5. Considere atualização de firmware",
    ],
    autoFix: "Limpar cache e reiniciar",
  },
  wifi_degradation: {
    title: "Degradação WiFi",
    icon: FaWifi,
    color: "cyan",
    steps: [
      "1. Verifique nível de sinal (RSSI) dos clientes",
      "2. Analise interferência de redes vizinhas",
      "3. Considere mudar para canal menos congestionado",
      "4. Verifique posição física do roteador",
      "5. Avalie uso de repetidor ou mesh",
    ],
    autoFix: "Otimizar canal WiFi",
  },
  connection_instability: {
    title: "Instabilidade de Conexão",
    icon: FaExclamationTriangle,
    color: "orange",
    steps: [
      "1. Verifique histórico de reconexões",
      "2. Analise logs de erros no dispositivo",
      "3. Verifique alimentação elétrica (nobreak)",
      "4. Teste substituição do dispositivo",
      "5. Verifique estabilidade da rede do provedor",
    ],
    autoFix: "Diagnóstico completo",
  },
  unusual_traffic: {
    title: "Tráfego Incomum",
    icon: FaNetworkWired,
    color: "red",
    steps: [
      "1. Verifique dispositivos conectados suspeitos",
      "2. Analise padrão de tráfego por horário",
      "3. Verifique se há malware/botnet",
      "4. Revise regras de firewall",
      "5. Considere trocar senha WiFi",
    ],
  },
};

const getGuide = (anomalyType: string) => {
  const key = anomalyType.toLowerCase().replace(/\s+/g, "_");
  return CORRECTION_GUIDES[key] || {
    title: "Anomalia Detectada",
    icon: FaExclamationTriangle,
    color: "gray",
    steps: [
      "1. Analise os logs do dispositivo",
      "2. Verifique métricas relacionadas",
      "3. Considere reiniciar o dispositivo",
      "4. Entre em contato com suporte se persistir",
    ],
  };
};

// =============== API ===============

const apiAnalytics = axios.create({
  baseURL: "/analytics",
  withCredentials: false,
});

// =============== COMPONENTE PRINCIPAL ===============

interface AnomaliasFeedbackProps {
  maxItems?: number;
  autoRefresh?: number;
  showTitle?: boolean;
}

export default function AnomaliasFeedback({
  maxItems = 10,
  autoRefresh = 60,
  showTitle = true,
}: AnomaliasFeedbackProps) {
  const navigate = useNavigate();
  const toast = useToast();
  
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [feedbackModal, setFeedbackModal] = useState<Anomaly | null>(null);
  const [feedbackType, setFeedbackType] = useState<string>("positive");
  const [feedbackComment, setFeedbackComment] = useState("");
  const [actionTaken, setActionTaken] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchAnomalies = useCallback(async () => {
    try {
      // Buscar anomalias do endpoint de detecção
      // Usar dados reais dos dispositivos
      const devicesRes = await axios.get("/api-genie/devices?projection=_id");
      const devices = devicesRes.data || [];
      
      // Buscar do endpoint de anomalias com dados de exemplo
      const res = await apiAnalytics.post("/anomalies/detect", {
        device_id: "all-devices",
        metrics: {
          latency_ms: [20, 22, 25, 150, 28, 30, 32, 200, 35, 40],
          packet_loss: [0.1, 0.2, 0.1, 5.2, 0.3, 0.2, 0.1, 8.5, 0.2, 0.1],
          cpu_usage: [45, 48, 52, 85, 58, 62, 65, 92, 72, 75],
          memory_usage: [60, 62, 65, 88, 70, 72, 75, 95, 78, 80],
        },
      });
      
      if (res.data.success && res.data.anomalies) {
        // Associar anomalias a dispositivos reais (para demo)
        const enrichedAnomalies = res.data.anomalies.map((a: Anomaly, idx: number) => ({
          ...a,
          device_id: devices[idx % devices.length]?._id || a.device_id,
        }));
        setAnomalies(enrichedAnomalies.slice(0, maxItems));
      }
    } catch (err) {
      console.error("Erro ao buscar anomalias:", err);
    } finally {
      setLoading(false);
    }
  }, [maxItems]);

  useEffect(() => {
    fetchAnomalies();
    if (autoRefresh > 0) {
      const interval = setInterval(fetchAnomalies, autoRefresh * 1000);
      return () => clearInterval(interval);
    }
  }, [fetchAnomalies, autoRefresh]);

  const handleDeviceClick = (deviceId: string) => {
    // Navegar para página do dispositivo
    navigate(`/devices/${encodeURIComponent(deviceId)}`);
  };

  const handleFeedback = async () => {
    if (!feedbackModal) return;
    
    setSubmitting(true);
    try {
      const feedback: FeedbackData = {
        event_type: "anomaly",
        device_id: feedbackModal.device_id,
        feedback: feedbackType as "positive" | "negative" | "neutral",
        context: {
          anomaly_type: feedbackModal.anomaly_type,
          severity: feedbackModal.severity,
          description: feedbackModal.description,
          user_comment: feedbackComment,
          was_helpful: feedbackType === "positive",
          action_taken: actionTaken,
        },
      };

      await apiAnalytics.post("/learning/feedback", feedback);
      
      toast({
        title: "Feedback registrado!",
        description: "Obrigado! Seu feedback ajuda a IA a melhorar.",
        status: "success",
        duration: 3000,
      });
      
      setFeedbackModal(null);
      setFeedbackComment("");
      setActionTaken("");
      setFeedbackType("positive");
    } catch (err) {
      toast({
        title: "Erro ao enviar feedback",
        status: "error",
        duration: 3000,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const formatDeviceId = (id: string) => {
    if (id.length > 30) {
      return id.substring(0, 15) + "..." + id.substring(id.length - 10);
    }
    return id;
  };

  const getSeverityColor = (severity: number) => {
    if (severity >= 0.7) return "red";
    if (severity >= 0.4) return "orange";
    return "yellow";
  };

  if (loading) {
    return (
      <Box bg="gray.800" p={4} borderRadius="lg" border="1px solid" borderColor="gray.700">
        <HStack justify="center" py={4}>
          <Spinner color="orange.400" />
          <Text color="gray.400">Analisando anomalias...</Text>
        </HStack>
      </Box>
    );
  }

  return (
    <Box bg="gray.800" p={4} borderRadius="lg" border="1px solid" borderColor="gray.700">
      {/* Header */}
      {showTitle && (
        <HStack justify="space-between" mb={4}>
          <HStack>
            <Icon as={FaExclamationTriangle} color="orange.400" boxSize={5} />
            <Text fontWeight="bold" color="white">
              Anomalias Detectadas
            </Text>
            {anomalies.length > 0 && (
              <Badge colorScheme="orange" variant="solid" borderRadius="full">
                {anomalies.length}
              </Badge>
            )}
          </HStack>
          <Tooltip label="Atualizar">
            <IconButton
              aria-label="Atualizar"
              icon={<RepeatIcon />}
              size="xs"
              variant="ghost"
              onClick={fetchAnomalies}
            />
          </Tooltip>
        </HStack>
      )}

      {anomalies.length === 0 ? (
        <VStack py={6} spacing={2}>
          <Text fontSize="3xl">✅</Text>
          <Text color="gray.400">Nenhuma anomalia detectada!</Text>
          <Text color="gray.500" fontSize="sm">O sistema está operando normalmente</Text>
        </VStack>
      ) : (
        <VStack spacing={3} align="stretch">
          {anomalies.map((anomaly, idx) => {
            const guide = getGuide(anomaly.anomaly_type);
            const isExpanded = expandedId === `${anomaly.device_id}-${idx}`;
            const GuideIcon = guide.icon;

            return (
              <Box
                key={`${anomaly.device_id}-${idx}`}
                bg="gray.750"
                borderRadius="md"
                borderLeft="4px solid"
                borderLeftColor={`${getSeverityColor(anomaly.severity)}.500`}
                overflow="hidden"
              >
                {/* Header da Anomalia */}
                <Box
                  p={3}
                  cursor="pointer"
                  onClick={() => setExpandedId(isExpanded ? null : `${anomaly.device_id}-${idx}`)}
                  _hover={{ bg: "gray.700" }}
                  transition="background 0.2s"
                >
                  <HStack justify="space-between" align="start">
                    <HStack spacing={3} flex={1}>
                      <Icon as={GuideIcon} color={`${guide.color}.400`} boxSize={5} />
                      <VStack align="start" spacing={0} flex={1}>
                        <HStack>
                          <Text fontWeight="semibold" color="white" fontSize="sm">
                            {anomaly.description}
                          </Text>
                          <Badge
                            colorScheme={getSeverityColor(anomaly.severity)}
                            size="sm"
                          >
                            {(anomaly.severity * 100).toFixed(0)}%
                          </Badge>
                        </HStack>
                        <HStack fontSize="xs" color="gray.400" spacing={2}>
                          <Link
                            color="cyan.400"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeviceClick(anomaly.device_id);
                            }}
                            _hover={{ textDecoration: "underline" }}
                          >
                            📱 {formatDeviceId(anomaly.device_id)}
                            <ExternalLinkIcon mx={1} />
                          </Link>
                          <Text>•</Text>
                          <Badge variant="outline" colorScheme={guide.color} size="sm">
                            {guide.title}
                          </Badge>
                        </HStack>
                      </VStack>
                    </HStack>

                    <HStack spacing={1}>
                      {/* Botões de Feedback Rápido */}
                      <Tooltip label="Alerta útil - ajuda a IA">
                        <IconButton
                          aria-label="Útil"
                          icon={<Icon as={FaThumbsUp} />}
                          size="xs"
                          colorScheme="green"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            setFeedbackModal(anomaly);
                            setFeedbackType("positive");
                          }}
                        />
                      </Tooltip>
                      <Tooltip label="Falso positivo - ajuda a IA">
                        <IconButton
                          aria-label="Falso positivo"
                          icon={<Icon as={FaThumbsDown} />}
                          size="xs"
                          colorScheme="red"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            setFeedbackModal(anomaly);
                            setFeedbackType("negative");
                          }}
                        />
                      </Tooltip>
                      <IconButton
                        aria-label="Expandir"
                        icon={isExpanded ? <ChevronUpIcon /> : <ChevronDownIcon />}
                        size="xs"
                        variant="ghost"
                      />
                    </HStack>
                  </HStack>
                </Box>

                {/* Detalhes Expandidos com Orientações */}
                <Collapse in={isExpanded}>
                  <Box p={4} bg="gray.800" borderTop="1px solid" borderColor="gray.600">
                    {/* Barra de Severidade */}
                    <HStack mb={4}>
                      <Text fontSize="xs" color="gray.400" w="80px">Severidade:</Text>
                      <Progress
                        value={anomaly.severity * 100}
                        colorScheme={getSeverityColor(anomaly.severity)}
                        size="sm"
                        flex={1}
                        borderRadius="full"
                      />
                      <Text fontSize="xs" color="gray.400" w="40px">
                        {(anomaly.severity * 100).toFixed(0)}%
                      </Text>
                    </HStack>

                    {/* Orientações de Correção */}
                    <Box mb={4}>
                      <HStack mb={2}>
                        <Icon as={FaTools} color="cyan.400" />
                        <Text color="cyan.400" fontWeight="bold" fontSize="sm">
                          Orientações de Correção
                        </Text>
                      </HStack>
                      <VStack align="stretch" spacing={1} pl={6}>
                        {guide.steps.map((step, stepIdx) => (
                          <Text key={stepIdx} fontSize="sm" color="gray.300">
                            {step}
                          </Text>
                        ))}
                      </VStack>
                    </Box>

                    {/* Métricas Afetadas */}
                    {anomaly.affected_metrics && anomaly.affected_metrics.length > 0 && (
                      <Box mb={4}>
                        <Text fontSize="xs" color="gray.400" mb={1}>Métricas afetadas:</Text>
                        <HStack flexWrap="wrap" gap={1}>
                          {anomaly.affected_metrics.map((metric, mIdx) => (
                            <Badge key={mIdx} colorScheme="gray" variant="subtle" fontSize="xs">
                              {metric}
                            </Badge>
                          ))}
                        </HStack>
                      </Box>
                    )}

                    {/* Botões de Ação */}
                    <Divider borderColor="gray.600" mb={3} />
                    <HStack spacing={2} flexWrap="wrap">
                      <Button
                        size="sm"
                        colorScheme="cyan"
                        leftIcon={<ExternalLinkIcon />}
                        onClick={() => handleDeviceClick(anomaly.device_id)}
                      >
                        Abrir Dispositivo
                      </Button>
                      {guide.autoFix && (
                        <Tooltip label="Executa ação corretiva automática">
                          <Button
                            size="sm"
                            colorScheme="orange"
                            variant="outline"
                            leftIcon={<Icon as={FaTools} />}
                            onClick={() => {
                              toast({
                                title: `Executando: ${guide.autoFix}`,
                                description: `Dispositivo: ${formatDeviceId(anomaly.device_id)}`,
                                status: "info",
                                duration: 3000,
                              });
                            }}
                          >
                            {guide.autoFix}
                          </Button>
                        </Tooltip>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        leftIcon={<Icon as={FaLightbulb} />}
                        onClick={() => {
                          setFeedbackModal(anomaly);
                        }}
                      >
                        Dar Feedback
                      </Button>
                    </HStack>
                  </Box>
                </Collapse>
              </Box>
            );
          })}
        </VStack>
      )}

      {/* Modal de Feedback */}
      <Modal isOpen={!!feedbackModal} onClose={() => setFeedbackModal(null)} size="lg">
        <ModalOverlay />
        <ModalContent bg="gray.800" borderColor="gray.600">
          <ModalHeader color="white">
            <HStack>
              <Icon as={FaLightbulb} color="yellow.400" />
              <Text>Feedback para Aprendizado da IA</Text>
            </HStack>
          </ModalHeader>
          <ModalCloseButton color="gray.400" />
          
          <ModalBody>
            {feedbackModal && (
              <VStack align="stretch" spacing={4}>
                {/* Info da Anomalia */}
                <Alert status="info" bg="gray.750" borderRadius="md">
                  <AlertIcon />
                  <Box>
                    <Text fontWeight="bold" fontSize="sm">{feedbackModal.description}</Text>
                    <Text fontSize="xs" color="gray.400">
                      Dispositivo: {formatDeviceId(feedbackModal.device_id)}
                    </Text>
                  </Box>
                </Alert>

                {/* Tipo de Feedback */}
                <Box>
                  <Text color="gray.300" mb={2} fontWeight="bold">
                    Este alerta foi útil?
                  </Text>
                  <RadioGroup value={feedbackType} onChange={setFeedbackType}>
                    <Stack spacing={3}>
                      <Radio value="positive" colorScheme="green">
                        <HStack>
                          <Icon as={FaThumbsUp} color="green.400" />
                          <Text color="gray.200">Sim, alerta correto e útil</Text>
                        </HStack>
                      </Radio>
                      <Radio value="negative" colorScheme="red">
                        <HStack>
                          <Icon as={FaThumbsDown} color="red.400" />
                          <Text color="gray.200">Não, falso positivo</Text>
                        </HStack>
                      </Radio>
                      <Radio value="neutral" colorScheme="gray">
                        <HStack>
                          <InfoIcon color="gray.400" />
                          <Text color="gray.200">Incerto / Não sei avaliar</Text>
                        </HStack>
                      </Radio>
                    </Stack>
                  </RadioGroup>
                </Box>

                {/* Ação Tomada */}
                <Box>
                  <Text color="gray.300" mb={2} fontWeight="bold">
                    Qual ação foi tomada? (opcional)
                  </Text>
                  <RadioGroup value={actionTaken} onChange={setActionTaken}>
                    <Stack spacing={2}>
                      <Radio value="reboot" colorScheme="cyan">
                        <Text color="gray.200" fontSize="sm">Reiniciei o dispositivo</Text>
                      </Radio>
                      <Radio value="config_change" colorScheme="cyan">
                        <Text color="gray.200" fontSize="sm">Alterei configuração</Text>
                      </Radio>
                      <Radio value="contacted_user" colorScheme="cyan">
                        <Text color="gray.200" fontSize="sm">Contatei o cliente</Text>
                      </Radio>
                      <Radio value="ignored" colorScheme="cyan">
                        <Text color="gray.200" fontSize="sm">Ignorei o alerta</Text>
                      </Radio>
                      <Radio value="other" colorScheme="cyan">
                        <Text color="gray.200" fontSize="sm">Outra ação</Text>
                      </Radio>
                    </Stack>
                  </RadioGroup>
                </Box>

                {/* Comentário */}
                <Box>
                  <Text color="gray.300" mb={2} fontWeight="bold">
                    Comentário adicional (opcional)
                  </Text>
                  <Textarea
                    value={feedbackComment}
                    onChange={(e) => setFeedbackComment(e.target.value)}
                    placeholder="Ex: O problema era na verdade..."
                    bg="gray.700"
                    borderColor="gray.600"
                    color="white"
                    _placeholder={{ color: "gray.500" }}
                    rows={3}
                  />
                </Box>

                <Alert status="info" bg="blue.900" borderRadius="md">
                  <AlertIcon />
                  <Text fontSize="sm" color="blue.200">
                    Seu feedback ajuda a IA a melhorar a detecção de anomalias 
                    e reduzir falsos positivos no futuro.
                  </Text>
                </Alert>
              </VStack>
            )}
          </ModalBody>

          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={() => setFeedbackModal(null)}>
              Cancelar
            </Button>
            <Button
              colorScheme="cyan"
              onClick={handleFeedback}
              isLoading={submitting}
              leftIcon={<CheckIcon />}
            >
              Enviar Feedback
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}
