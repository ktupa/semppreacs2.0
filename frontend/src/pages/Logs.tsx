import { useEffect, useState } from "react";
import {
  Box, Text, Table, Thead, Tbody, Tr, Th, Td,
  Badge, Select, Input, HStack, Button, VStack,
  Spinner, Icon, Heading, InputGroup, InputRightElement,
  Flex, Grid, GridItem, Stat, StatLabel, StatNumber
} from "@chakra-ui/react";
import { FiSearch, FiRefreshCw, FiFileText, FiAlertCircle, FiCheckCircle, FiClock } from "react-icons/fi";
import { getTasksRecent, getErrorsRecent } from "../services/genieAcsApi";

interface LogItem {
  tipo: "evento" | "comando" | "erro";
  serial: string;
  ip?: string;
  evento?: string;
  detalhes?: string;
  parametro?: string;
  valor?: string;
  status?: string;
  data: string;
}

export default function Logs() {
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [filtroTipo, setFiltroTipo] = useState("ambos");
  const [filtroSerial, setFiltroSerial] = useState("");
  const [dataIni, setDataIni] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [loading, setLoading] = useState(true);

  const carregarLogs = async () => {
    setLoading(true);
    try {
      const [tasks, faults] = await Promise.all([
        getTasksRecent(100),
        getErrorsRecent(100),
      ]);

      const logsFromTasks: LogItem[] = tasks.map((t: any) => ({
        tipo: "comando" as const,
        serial: t.device || t._id?.split('-')[0] || "N/A",
        parametro: t.name || "task",
        valor: JSON.stringify(t.parameterValues || t.parameterNames || {}).slice(0, 100),
        status: t.fault ? "erro" : "ok",
        data: t.timestamp || new Date().toISOString(),
      }));

      const logsFromFaults: LogItem[] = faults.map((f: any) => ({
        tipo: "erro" as const,
        serial: f.device || "N/A",
        evento: `Fault ${f.faultCode || f.code || "?"}`,
        detalhes: f.faultString || f.message || "Erro desconhecido",
        status: "erro",
        data: f.timestamp || new Date().toISOString(),
      }));

      let allLogs = [...logsFromTasks, ...logsFromFaults];
      
      if (filtroTipo === "comando") {
        allLogs = allLogs.filter(l => l.tipo === "comando");
      } else if (filtroTipo === "evento" || filtroTipo === "erro") {
        allLogs = allLogs.filter(l => l.tipo === "erro" || l.tipo === "evento");
      }
      
      if (filtroSerial) {
        allLogs = allLogs.filter(l => l.serial.toLowerCase().includes(filtroSerial.toLowerCase()));
      }
      
      if (dataIni) {
        const ini = new Date(dataIni);
        allLogs = allLogs.filter(l => new Date(l.data) >= ini);
      }
      
      if (dataFim) {
        const fim = new Date(dataFim);
        fim.setHours(23, 59, 59);
        allLogs = allLogs.filter(l => new Date(l.data) <= fim);
      }

      allLogs.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());

      setLogs(allLogs);
    } catch (err) {
      console.error("Erro ao carregar logs:", err);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarLogs();
  }, []);

  const comandosCount = logs.filter(l => l.tipo === "comando").length;
  const errosCount = logs.filter(l => l.tipo === "erro").length;
  const okCount = logs.filter(l => l.status === "ok").length;

  return (
    <Box bg="gray.900" minH="100vh" p={6}>
      {/* Header */}
      <Flex justify="space-between" align="center" mb={8}>
        <HStack spacing={4}>
          <Box p={3} bg="cyan.500" borderRadius="xl">
            <Icon as={FiFileText} boxSize={6} color="white" />
          </Box>
          <VStack align="start" spacing={0}>
            <Heading size="lg" color="white" fontWeight="bold">
              Histórico de Logs
            </Heading>
            <Text color="cyan.200" fontSize="sm">
              Comandos, eventos e erros do sistema
            </Text>
          </VStack>
        </HStack>
        <Button
          leftIcon={<FiRefreshCw />}
          colorScheme="cyan"
          onClick={carregarLogs}
          isLoading={loading}
          fontWeight="bold"
        >
          Atualizar
        </Button>
      </Flex>

      {/* Stats Cards */}
      <Grid templateColumns={{ base: "1fr", md: "repeat(3, 1fr)" }} gap={4} mb={6}>
        <GridItem>
          <Box
            bg="linear-gradient(135deg, #1a365d 0%, #2a4365 100%)"
            p={5}
            borderRadius="xl"
            border="1px solid"
            borderColor="blue.600"
          >
            <HStack spacing={4}>
              <Box p={3} bg="blue.500" borderRadius="lg">
                <Icon as={FiCheckCircle} boxSize={5} color="white" />
              </Box>
              <Stat>
                <StatLabel color="blue.100" fontWeight="semibold">Comandos</StatLabel>
                <StatNumber color="white" fontSize="2xl">{comandosCount}</StatNumber>
              </Stat>
            </HStack>
          </Box>
        </GridItem>
        <GridItem>
          <Box
            bg="linear-gradient(135deg, #63171b 0%, #822727 100%)"
            p={5}
            borderRadius="xl"
            border="1px solid"
            borderColor="red.500"
          >
            <HStack spacing={4}>
              <Box p={3} bg="red.500" borderRadius="lg">
                <Icon as={FiAlertCircle} boxSize={5} color="white" />
              </Box>
              <Stat>
                <StatLabel color="red.100" fontWeight="semibold">Erros</StatLabel>
                <StatNumber color="white" fontSize="2xl">{errosCount}</StatNumber>
              </Stat>
            </HStack>
          </Box>
        </GridItem>
        <GridItem>
          <Box
            bg="linear-gradient(135deg, #1c4532 0%, #22543d 100%)"
            p={5}
            borderRadius="xl"
            border="1px solid"
            borderColor="green.500"
          >
            <HStack spacing={4}>
              <Box p={3} bg="green.500" borderRadius="lg">
                <Icon as={FiClock} boxSize={5} color="white" />
              </Box>
              <Stat>
                <StatLabel color="green.100" fontWeight="semibold">Sucesso</StatLabel>
                <StatNumber color="white" fontSize="2xl">{okCount}</StatNumber>
              </Stat>
            </HStack>
          </Box>
        </GridItem>
      </Grid>

      {/* Filters */}
      <Box bg="gray.800" p={4} borderRadius="xl" mb={6} border="1px solid" borderColor="gray.700">
        <HStack spacing={4} wrap="wrap">
          <Select
            value={filtroTipo}
            onChange={(e) => setFiltroTipo(e.target.value)}
            maxW="200px"
            bg="gray.700"
            border="2px solid"
            borderColor="gray.600"
            color="white"
            _hover={{ borderColor: "cyan.500" }}
          >
            <option value="ambos" style={{ background: "#2D3748" }}>Todos</option>
            <option value="comando" style={{ background: "#2D3748" }}>Somente Comandos</option>
            <option value="evento" style={{ background: "#2D3748" }}>Somente Eventos/Erros</option>
          </Select>
          
          <InputGroup maxW="200px">
            <Input
              placeholder="Serial"
              value={filtroSerial}
              onChange={(e) => setFiltroSerial(e.target.value)}
              bg="gray.700"
              border="2px solid"
              borderColor="gray.600"
              color="white"
              _placeholder={{ color: "gray.400" }}
              _hover={{ borderColor: "cyan.500" }}
            />
            <InputRightElement>
              <FiSearch color="#A0AEC0" />
            </InputRightElement>
          </InputGroup>
          
          <Input
            type="date"
            value={dataIni}
            onChange={(e) => setDataIni(e.target.value)}
            maxW="180px"
            bg="gray.700"
            border="2px solid"
            borderColor="gray.600"
            color="white"
            _hover={{ borderColor: "cyan.500" }}
          />
          
          <Input
            type="date"
            value={dataFim}
            onChange={(e) => setDataFim(e.target.value)}
            maxW="180px"
            bg="gray.700"
            border="2px solid"
            borderColor="gray.600"
            color="white"
            _hover={{ borderColor: "cyan.500" }}
          />
          
          <Button
            onClick={carregarLogs}
            colorScheme="cyan"
            isLoading={loading}
            leftIcon={<FiSearch />}
          >
            Buscar
          </Button>
        </HStack>
      </Box>

      {/* Table */}
      {loading ? (
        <Box textAlign="center" p={10}>
          <Spinner size="xl" color="cyan.400" thickness="4px" />
          <Text color="gray.300" mt={4}>Carregando logs...</Text>
        </Box>
      ) : (
        <Box bg="gray.800" borderRadius="xl" overflow="hidden" border="1px solid" borderColor="gray.600">
          <Box overflowX="auto">
            <Table variant="simple">
              <Thead bg="gray.700">
                <Tr>
                  <Th color="cyan.200" fontWeight="bold" fontSize="xs" textTransform="uppercase" borderColor="gray.600">Tipo</Th>
                  <Th color="cyan.200" fontWeight="bold" fontSize="xs" textTransform="uppercase" borderColor="gray.600">Serial</Th>
                  <Th color="cyan.200" fontWeight="bold" fontSize="xs" textTransform="uppercase" borderColor="gray.600">Parâmetro / Evento</Th>
                  <Th color="cyan.200" fontWeight="bold" fontSize="xs" textTransform="uppercase" borderColor="gray.600">Valor / Detalhes</Th>
                  <Th color="cyan.200" fontWeight="bold" fontSize="xs" textTransform="uppercase" borderColor="gray.600">Status</Th>
                  <Th color="cyan.200" fontWeight="bold" fontSize="xs" textTransform="uppercase" borderColor="gray.600">Data</Th>
                </Tr>
              </Thead>
              <Tbody>
                {logs.map((log, index) => (
                  <Tr
                    key={index}
                    bg={index % 2 === 0 ? "gray.800" : "gray.750"}
                    _hover={{ bg: "gray.700" }}
                    borderBottom="1px solid"
                    borderColor="gray.600"
                  >
                    <Td borderColor="gray.600">
                      <Badge
                        px={3}
                        py={1}
                        borderRadius="full"
                        fontWeight="bold"
                        fontSize="xs"
                        bg={log.tipo === "erro" ? "red.500" : log.tipo === "evento" ? "purple.500" : "green.500"}
                        color="white"
                      >
                        {log.tipo}
                      </Badge>
                    </Td>
                    <Td color="white" fontWeight="medium" borderColor="gray.600">{log.serial}</Td>
                    <Td color="gray.100" borderColor="gray.600">{log.evento || log.parametro}</Td>
                    <Td color="gray.200" fontSize="sm" maxW="300px" isTruncated borderColor="gray.600">
                      {log.detalhes || log.valor}
                    </Td>
                    <Td borderColor="gray.600">
                      {log.status && (
                        <Badge
                          px={3}
                          py={1}
                          borderRadius="full"
                          fontWeight="bold"
                          fontSize="xs"
                          bg={
                            log.status === "ok" ? "green.500" :
                            log.status === "pendente" ? "yellow.500" :
                            "red.500"
                          }
                          color="white"
                        >
                          {log.status}
                        </Badge>
                      )}
                    </Td>
                    <Td color="gray.300" fontSize="sm" borderColor="gray.600">
                      {new Date(log.data).toLocaleString("pt-BR")}
                    </Td>
                  </Tr>
                ))}
                {logs.length === 0 && (
                  <Tr>
                    <Td colSpan={6} py={12} textAlign="center" borderColor="gray.600">
                      <VStack spacing={3}>
                        <Icon as={FiFileText} boxSize={10} color="gray.500" />
                        <Text color="gray.300" fontSize="lg">Nenhum log encontrado</Text>
                        <Text color="gray.500" fontSize="sm">Tente ajustar os filtros</Text>
                      </VStack>
                    </Td>
                  </Tr>
                )}
              </Tbody>
            </Table>
          </Box>
        </Box>
      )}
    </Box>
  );
}
