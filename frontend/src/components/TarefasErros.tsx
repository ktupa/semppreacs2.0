import { useEffect, useState, useCallback } from "react";
import {
  Box,
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
  Badge,
  Text,
  Spinner,
  HStack,
  VStack,
  IconButton,
  Tooltip,
  Select,
  useToast,
} from "@chakra-ui/react";
import { RepeatIcon, CheckIcon, WarningIcon } from "@chakra-ui/icons";
import {
  getTasksRecent,
  getErrorsRecent,
  getFeedsAlerts,
  getFeedsTasks,
  getFeedsSummary,
  updateFeedAlert,
  FeedAlert,
  FeedTask,
  FeedsSummary,
} from "../services/genieAcsApi";

interface LegacyItem {
  time: string;
  deviceId?: string;
  name?: string;
  status?: string;
  detail?: string;
}

type DataSource = "all" | "genie" | "backend";

// Helper para converter qualquer valor em string segura para renderização
function safeString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "object") {
    // Se for um objeto Error-like
    if ("message" in (value as object)) {
      return String((value as { message: unknown }).message);
    }
    // Se for um objeto com faultString (erro do GenieACS)
    if ("faultString" in (value as object)) {
      return String((value as { faultString: unknown }).faultString);
    }
    // Fallback: JSON stringify
    try {
      return JSON.stringify(value);
    } catch {
      return "[object]";
    }
  }
  return String(value);
}

export default function TarefasErros() {
  const [tarefasGenie, setTarefasGenie] = useState<LegacyItem[]>([]);
  const [errosGenie, setErrosGenie] = useState<LegacyItem[]>([]);
  const [alertsBackend, setAlertsBackend] = useState<FeedAlert[]>([]);
  const [tasksBackend, setTasksBackend] = useState<FeedTask[]>([]);
  const [summary, setSummary] = useState<FeedsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [dataSource, setDataSource] = useState<DataSource>("all");
  const toast = useToast();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Carregar dados em paralelo
      const [genieTasksRes, genieErrorsRes, backendAlertsRes, backendTasksRes, summaryRes] = await Promise.allSettled([
        getTasksRecent?.(50) ?? Promise.resolve([]),
        getErrorsRecent?.(50) ?? Promise.resolve([]),
        getFeedsAlerts({ limit: 50, hours: 24 }),
        getFeedsTasks({ limit: 50, hours: 24 }),
        getFeedsSummary(24),
      ]);

      if (genieTasksRes.status === "fulfilled") setTarefasGenie(genieTasksRes.value);
      if (genieErrorsRes.status === "fulfilled") setErrosGenie(genieErrorsRes.value);
      if (backendAlertsRes.status === "fulfilled") setAlertsBackend(backendAlertsRes.value.alerts);
      if (backendTasksRes.status === "fulfilled") setTasksBackend(backendTasksRes.value.tasks);
      if (summaryRes.status === "fulfilled") setSummary(summaryRes.value);
    } catch (err) {
      console.error("Erro carregando dados:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    // Atualizar a cada 30 segundos
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [loadData]);

  const handleAcknowledgeAlert = async (alertId: number) => {
    const success = await updateFeedAlert(alertId, { status: "acknowledged" });
    if (success) {
      toast({ title: "Alerta reconhecido", status: "success", duration: 2000 });
      loadData();
    } else {
      toast({ title: "Erro ao reconhecer alerta", status: "error", duration: 3000 });
    }
  };

  const handleResolveAlert = async (alertId: number) => {
    const success = await updateFeedAlert(alertId, { status: "resolved" });
    if (success) {
      toast({ title: "Alerta resolvido", status: "success", duration: 2000 });
      loadData();
    } else {
      toast({ title: "Erro ao resolver alerta", status: "error", duration: 3000 });
    }
  };

  const severityColor = (sev: string) => {
    switch (sev) {
      case "critical": return "red";
      case "error": return "orange";
      case "warning": return "yellow";
      default: return "blue";
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "ok":
      case "success":
        return <Badge colorScheme="green">OK</Badge>;
      case "fail":
      case "failed":
      case "error":
        return <Badge colorScheme="red">Falha</Badge>;
      case "pending":
        return <Badge colorScheme="yellow">Pendente</Badge>;
      case "running":
        return <Badge colorScheme="blue">Executando</Badge>;
      case "active":
        return <Badge colorScheme="orange">Ativo</Badge>;
      case "acknowledged":
        return <Badge colorScheme="cyan">Reconhecido</Badge>;
      case "resolved":
        return <Badge colorScheme="green">Resolvido</Badge>;
      default:
        return <Badge colorScheme="gray">{status || "?"}</Badge>;
    }
  };

  // Combinar tarefas de ambas as fontes
  const allTasks = dataSource === "genie"
    ? tarefasGenie
    : dataSource === "backend"
    ? tasksBackend.map(t => ({
        time: t.created_at ? new Date(t.created_at).toLocaleString() : "",
        deviceId: t.device_id,
        name: t.task_type,
        status: t.status,
        detail: t.fault_message || undefined,
      }))
    : [
        ...tarefasGenie,
        ...tasksBackend.map(t => ({
          time: t.created_at ? new Date(t.created_at).toLocaleString() : "",
          deviceId: t.device_id,
          name: t.task_type,
          status: t.status,
          detail: t.fault_message || undefined,
        })),
      ].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

  // Combinar erros/alertas de ambas as fontes
  const allErrors = dataSource === "genie"
    ? errosGenie
    : dataSource === "backend"
    ? alertsBackend
    : [
        ...errosGenie,
        ...alertsBackend.map(a => ({
          time: a.created_at ? new Date(a.created_at).toLocaleString() : "",
          deviceId: a.device_id,
          name: a.title,
          status: a.severity,
          detail: a.message,
          _isBackend: true,
          _id: a.id,
          _fullAlert: a,
        })),
      ].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

  return (
    <Box bg="gray.800" p={4} borderRadius="lg" border="1px solid" borderColor="gray.700">
      {/* Header com resumo e controles */}
      <HStack justify="space-between" mb={4}>
        <VStack align="start" spacing={0}>
          <Text fontWeight="bold" color="white">Tarefas & Alertas</Text>
          {summary && (
            <HStack spacing={4} fontSize="xs" color="gray.400">
              <Text>
                Alertas: <Badge colorScheme="red" size="sm">{summary.alerts.active}</Badge> ativos
              </Text>
              <Text>
                Tarefas: <Badge colorScheme="green" size="sm">{summary.tasks.success}</Badge> ok /
                <Badge colorScheme="red" size="sm" ml={1}>{summary.tasks.failed}</Badge> falhas
              </Text>
            </HStack>
          )}
        </VStack>
        <HStack>
          <Select
            size="sm"
            bg="gray.700"
            value={dataSource}
            onChange={(e) => setDataSource(e.target.value as DataSource)}
            w="140px"
          >
            <option value="all">Todas Fontes</option>
            <option value="genie">GenieACS</option>
            <option value="backend">Backend IA</option>
          </Select>
          <Tooltip label="Atualizar">
            <IconButton
              aria-label="Atualizar"
              icon={loading ? <Spinner size="sm" /> : <RepeatIcon />}
              size="sm"
              onClick={loadData}
              isDisabled={loading}
            />
          </Tooltip>
        </HStack>
      </HStack>

      <Tabs colorScheme="teal" isFitted>
        <TabList>
          <Tab>
            Tarefas recentes
            {allTasks.length > 0 && (
              <Badge ml={2} colorScheme="blue">{allTasks.length}</Badge>
            )}
          </Tab>
          <Tab>
            Erros / Alertas
            {allErrors.length > 0 && (
              <Badge ml={2} colorScheme="red">{allErrors.length}</Badge>
            )}
          </Tab>
        </TabList>
        <TabPanels>
          {/* Tarefas */}
          <TabPanel px={0}>
            {loading ? (
              <HStack justify="center" py={4}>
                <Spinner size="md" color="teal.400" />
                <Text color="gray.400">Carregando...</Text>
              </HStack>
            ) : allTasks.length ? (
              <Box maxH="400px" overflowY="auto">
                <Table size="sm" variant="simple">
                  <Thead position="sticky" top={0} bg="gray.800" zIndex={1}>
                    <Tr>
                      <Th color="gray.400">Quando</Th>
                      <Th color="gray.400">Device</Th>
                      <Th color="gray.400">Ação</Th>
                      <Th color="gray.400">Status</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {allTasks.slice(0, 50).map((t, i) => (
                      <Tr key={i} _hover={{ bg: "gray.700" }}>
                        <Td color="gray.300" fontSize="xs">{safeString(t.time)}</Td>
                        <Td color="gray.300" fontSize="xs" maxW="150px" isTruncated>
                          {safeString(t.deviceId) || "—"}
                        </Td>
                        <Td color="gray.300" fontSize="xs">{safeString(t.name)}</Td>
                        <Td>{statusBadge(safeString(t.status))}</Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              </Box>
            ) : (
              <Text color="gray.400" fontSize="sm" py={4} textAlign="center">
                Sem tarefas recentes.
              </Text>
            )}
          </TabPanel>

          {/* Erros / Alertas */}
          <TabPanel px={0}>
            {loading ? (
              <HStack justify="center" py={4}>
                <Spinner size="md" color="teal.400" />
                <Text color="gray.400">Carregando...</Text>
              </HStack>
            ) : allErrors.length ? (
              <Box maxH="400px" overflowY="auto">
                <Table size="sm" variant="simple">
                  <Thead position="sticky" top={0} bg="gray.800" zIndex={1}>
                    <Tr>
                      <Th color="gray.400">Quando</Th>
                      <Th color="gray.400">Device</Th>
                      <Th color="gray.400">Descrição</Th>
                      <Th color="gray.400">Severidade</Th>
                      <Th color="gray.400">Ações</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {allErrors.slice(0, 50).map((e: any, i) => {
                      const timeStr = safeString(e.time);
                      const deviceStr = safeString(e.deviceId);
                      const detailStr = safeString(e.detail) || safeString(e.name);
                      const statusStr = safeString(e.status) || "info";
                      
                      return (
                        <Tr key={i} _hover={{ bg: "gray.700" }}>
                          <Td color="gray.300" fontSize="xs">{timeStr}</Td>
                          <Td color="gray.300" fontSize="xs" maxW="150px" isTruncated>
                            {deviceStr || "—"}
                          </Td>
                          <Td color="gray.300" fontSize="xs" maxW="200px" isTruncated>
                            <Tooltip label={detailStr}>
                              <Text>{detailStr}</Text>
                            </Tooltip>
                          </Td>
                          <Td>
                            <Badge colorScheme={severityColor(statusStr)}>
                              {statusStr}
                            </Badge>
                          </Td>
                          <Td>
                            {e._isBackend && e._fullAlert && e._fullAlert.status === "active" && (
                              <HStack spacing={1}>
                                <Tooltip label="Reconhecer">
                                  <IconButton
                                    aria-label="Reconhecer"
                                    icon={<CheckIcon />}
                                    size="xs"
                                    colorScheme="cyan"
                                    variant="ghost"
                                    onClick={() => handleAcknowledgeAlert(e._id)}
                                  />
                                </Tooltip>
                                <Tooltip label="Resolver">
                                  <IconButton
                                    aria-label="Resolver"
                                    icon={<WarningIcon />}
                                    size="xs"
                                    colorScheme="green"
                                    variant="ghost"
                                    onClick={() => handleResolveAlert(e._id)}
                                  />
                                </Tooltip>
                              </HStack>
                            )}
                          </Td>
                        </Tr>
                      );
                    })}
                  </Tbody>
                </Table>
              </Box>
            ) : (
              <Text color="gray.400" fontSize="sm" py={4} textAlign="center">
                Sem erros recentes 🎉
              </Text>
            )}
          </TabPanel>
        </TabPanels>
      </Tabs>
    </Box>
  );
}
