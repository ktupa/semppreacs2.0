import { useEffect, useState, useCallback } from "react";
import {
  Box,
  VStack,
  HStack,
  Text,
  Badge,
  IconButton,
  Tooltip,
  Spinner,
  Select,
  useToast,
  Divider,
  Collapse,
} from "@chakra-ui/react";
import {
  RepeatIcon,
  CheckIcon,
  WarningIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  BellIcon,
} from "@chakra-ui/icons";
import {
  getFeedsAlerts,
  getFeedsSummary,
  updateFeedAlert,
  FeedAlert,
  FeedsSummary,
} from "../services/genieAcsApi";

interface AlertasRecentesProps {
  maxItems?: number;
  autoRefreshSeconds?: number;
  showSummary?: boolean;
}

export default function AlertasRecentes({
  maxItems = 10,
  autoRefreshSeconds = 30,
  showSummary = true,
}: AlertasRecentesProps) {
  const [alerts, setAlerts] = useState<FeedAlert[]>([]);
  const [summary, setSummary] = useState<FeedsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [severityFilter, setSeverityFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const toast = useToast();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [alertsRes, summaryRes] = await Promise.allSettled([
        getFeedsAlerts({
          limit: maxItems,
          severity: severityFilter || undefined,
          status: statusFilter || undefined,
          hours: 48,
        }),
        showSummary ? getFeedsSummary(24) : Promise.resolve(null),
      ]);

      if (alertsRes.status === "fulfilled") {
        setAlerts(alertsRes.value.alerts);
      }
      if (summaryRes.status === "fulfilled" && summaryRes.value) {
        setSummary(summaryRes.value);
      }
    } catch (err) {
      console.error("Erro carregando alertas:", err);
    } finally {
      setLoading(false);
    }
  }, [maxItems, severityFilter, statusFilter, showSummary]);

  useEffect(() => {
    loadData();
    if (autoRefreshSeconds > 0) {
      const interval = setInterval(loadData, autoRefreshSeconds * 1000);
      return () => clearInterval(interval);
    }
  }, [loadData, autoRefreshSeconds]);

  const handleAcknowledge = async (alertId: number) => {
    const success = await updateFeedAlert(alertId, { status: "acknowledged" });
    if (success) {
      toast({ title: "Alerta reconhecido", status: "success", duration: 2000 });
      loadData();
    } else {
      toast({ title: "Erro ao reconhecer alerta", status: "error", duration: 3000 });
    }
  };

  const handleResolve = async (alertId: number) => {
    const success = await updateFeedAlert(alertId, { status: "resolved" });
    if (success) {
      toast({ title: "Alerta resolvido", status: "success", duration: 2000 });
      loadData();
    } else {
      toast({ title: "Erro ao resolver alerta", status: "error", duration: 3000 });
    }
  };

  const severityConfig = {
    critical: { color: "red", icon: "🔴", label: "Crítico" },
    error: { color: "orange", icon: "🟠", label: "Erro" },
    warning: { color: "yellow", icon: "🟡", label: "Aviso" },
    info: { color: "blue", icon: "🔵", label: "Info" },
  };

  const getSeverityConfig = (sev: string) =>
    severityConfig[sev as keyof typeof severityConfig] || severityConfig.info;

  const categoryIcons: Record<string, string> = {
    connectivity: "🌐",
    wifi: "📶",
    wan: "🔌",
    security: "🔒",
    performance: "⚡",
    general: "📋",
  };

  const formatTime = (isoString?: string) => {
    if (!isoString) return "—";
    try {
      const d = new Date(isoString);
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return "Agora";
      if (diffMins < 60) return `${diffMins}m atrás`;
      if (diffHours < 24) return `${diffHours}h atrás`;
      if (diffDays < 7) return `${diffDays}d atrás`;
      return d.toLocaleDateString();
    } catch {
      return "—";
    }
  };

  return (
    <Box bg="gray.800" p={4} borderRadius="lg" border="1px solid" borderColor="gray.700">
      {/* Header */}
      <HStack justify="space-between" mb={4}>
        <HStack>
          <BellIcon color="teal.400" boxSize={5} />
          <Text fontWeight="bold" color="white">
            Alertas do Sistema
          </Text>
          {alerts.length > 0 && (
            <Badge colorScheme="red" variant="solid" borderRadius="full">
              {alerts.length}
            </Badge>
          )}
        </HStack>
        <HStack spacing={2}>
          <Select
            size="xs"
            bg="gray.700"
            w="100px"
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            placeholder="Severidade"
          >
            <option value="critical">Crítico</option>
            <option value="error">Erro</option>
            <option value="warning">Aviso</option>
            <option value="info">Info</option>
          </Select>
          <Select
            size="xs"
            bg="gray.700"
            w="100px"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">Todos</option>
            <option value="active">Ativos</option>
            <option value="acknowledged">Reconhecidos</option>
            <option value="resolved">Resolvidos</option>
          </Select>
          <Tooltip label="Atualizar">
            <IconButton
              aria-label="Atualizar"
              icon={loading ? <Spinner size="sm" /> : <RepeatIcon />}
              size="xs"
              onClick={loadData}
              isDisabled={loading}
            />
          </Tooltip>
        </HStack>
      </HStack>

      {/* Summary Cards */}
      {showSummary && summary && (
        <HStack spacing={3} mb={4} overflowX="auto" pb={2}>
          <Box bg="red.900" px={3} py={2} borderRadius="md" minW="80px">
            <Text fontSize="2xl" fontWeight="bold" color="red.200">
              {summary.alerts.critical}
            </Text>
            <Text fontSize="xs" color="red.300">
              Críticos
            </Text>
          </Box>
          <Box bg="orange.900" px={3} py={2} borderRadius="md" minW="80px">
            <Text fontSize="2xl" fontWeight="bold" color="orange.200">
              {summary.alerts.error}
            </Text>
            <Text fontSize="xs" color="orange.300">
              Erros
            </Text>
          </Box>
          <Box bg="yellow.900" px={3} py={2} borderRadius="md" minW="80px">
            <Text fontSize="2xl" fontWeight="bold" color="yellow.200">
              {summary.alerts.warning}
            </Text>
            <Text fontSize="xs" color="yellow.300">
              Avisos
            </Text>
          </Box>
          <Box bg="blue.900" px={3} py={2} borderRadius="md" minW="80px">
            <Text fontSize="2xl" fontWeight="bold" color="blue.200">
              {summary.alerts.active}
            </Text>
            <Text fontSize="xs" color="blue.300">
              Ativos
            </Text>
          </Box>
        </HStack>
      )}

      <Divider borderColor="gray.600" mb={3} />

      {/* Alerts List */}
      {loading && alerts.length === 0 ? (
        <HStack justify="center" py={6}>
          <Spinner size="md" color="teal.400" />
          <Text color="gray.400">Carregando alertas...</Text>
        </HStack>
      ) : alerts.length === 0 ? (
        <VStack py={6} spacing={2}>
          <Text fontSize="3xl">🎉</Text>
          <Text color="gray.400">Nenhum alerta no momento!</Text>
        </VStack>
      ) : (
        <VStack spacing={2} align="stretch" maxH="400px" overflowY="auto">
          {alerts.map((alert) => {
            const sevConfig = getSeverityConfig(alert.severity);
            const isExpanded = expandedId === alert.id;

            return (
              <Box
                key={alert.id}
                bg="gray.750"
                p={3}
                borderRadius="md"
                borderLeft="4px solid"
                borderLeftColor={`${sevConfig.color}.500`}
                cursor="pointer"
                onClick={() => setExpandedId(isExpanded ? null : alert.id)}
                _hover={{ bg: "gray.700" }}
                transition="background 0.2s"
              >
                <HStack justify="space-between" align="start">
                  <HStack align="start" spacing={3} flex={1}>
                    <Text fontSize="lg">{sevConfig.icon}</Text>
                    <VStack align="start" spacing={0} flex={1}>
                      <HStack>
                        <Text fontWeight="semibold" color="white" fontSize="sm">
                          {alert.title}
                        </Text>
                        <Badge
                          colorScheme={sevConfig.color}
                          size="sm"
                          variant="subtle"
                        >
                          {sevConfig.label}
                        </Badge>
                        {alert.status !== "active" && (
                          <Badge
                            colorScheme={alert.status === "resolved" ? "green" : "cyan"}
                            size="sm"
                          >
                            {alert.status === "resolved" ? "Resolvido" : "Reconhecido"}
                          </Badge>
                        )}
                      </HStack>
                      <HStack fontSize="xs" color="gray.400" spacing={3}>
                        <Text>{categoryIcons[alert.category] || "📋"} {alert.category}</Text>
                        {alert.device_id && (
                          <Text>📱 {alert.device_id.substring(0, 20)}...</Text>
                        )}
                        <Text>🕐 {formatTime(alert.created_at)}</Text>
                      </HStack>
                    </VStack>
                  </HStack>

                  <HStack spacing={1}>
                    {alert.status === "active" && (
                      <>
                        <Tooltip label="Reconhecer">
                          <IconButton
                            aria-label="Reconhecer"
                            icon={<CheckIcon />}
                            size="xs"
                            colorScheme="cyan"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAcknowledge(alert.id);
                            }}
                          />
                        </Tooltip>
                        <Tooltip label="Resolver">
                          <IconButton
                            aria-label="Resolver"
                            icon={<WarningIcon />}
                            size="xs"
                            colorScheme="green"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleResolve(alert.id);
                            }}
                          />
                        </Tooltip>
                      </>
                    )}
                    <IconButton
                      aria-label="Expandir"
                      icon={isExpanded ? <ChevronUpIcon /> : <ChevronDownIcon />}
                      size="xs"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedId(isExpanded ? null : alert.id);
                      }}
                    />
                  </HStack>
                </HStack>

                {/* Expanded Details */}
                <Collapse in={isExpanded}>
                  <Box mt={3} pt={3} borderTop="1px solid" borderTopColor="gray.600">
                    {alert.message && (
                      <Text fontSize="sm" color="gray.300" mb={2}>
                        {alert.message}
                      </Text>
                    )}
                    <HStack spacing={4} fontSize="xs" color="gray.500" flexWrap="wrap">
                      <Text>ID: {alert.id}</Text>
                      {alert.acknowledged_at && (
                        <Text>Reconhecido: {formatTime(alert.acknowledged_at)}</Text>
                      )}
                      {alert.resolved_at && (
                        <Text>Resolvido: {formatTime(alert.resolved_at)}</Text>
                      )}
                    </HStack>
                    {alert.details && Object.keys(alert.details).length > 0 && (
                      <Box
                        mt={2}
                        p={2}
                        bg="gray.900"
                        borderRadius="md"
                        fontSize="xs"
                        fontFamily="mono"
                        color="gray.400"
                        maxH="100px"
                        overflowY="auto"
                      >
                        <pre>{JSON.stringify(alert.details, null, 2)}</pre>
                      </Box>
                    )}
                  </Box>
                </Collapse>
              </Box>
            );
          })}
        </VStack>
      )}
    </Box>
  );
}
