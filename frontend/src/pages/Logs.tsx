import { useEffect, useState } from "react";
import {
  Box, Text, Table, Thead, Tbody, Tr, Th, Td,
  TableContainer, Badge, Select, Input, HStack, Button,
  Spinner
} from "@chakra-ui/react";
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
      // Buscar tasks e faults do GenieACS via proxy bridge
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
      
      // Aplicar filtros
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

      // Ordenar por data decrescente
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

  return (
    <Box>
      <Text fontSize="2xl" mb={4} fontWeight="bold" color="white">
        Histórico de Logs (Comandos & Eventos)
      </Text>

      <HStack mb={4} spacing={4}>
        <Select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}>
          <option value="ambos">Todos</option>
          <option value="comando">Somente Comandos</option>
          <option value="evento">Somente Eventos/Erros</option>
        </Select>
        <Input
          placeholder="Serial"
          value={filtroSerial}
          onChange={(e) => setFiltroSerial(e.target.value)}
        />
        <Input
          type="date"
          value={dataIni}
          onChange={(e) => setDataIni(e.target.value)}
        />
        <Input
          type="date"
          value={dataFim}
          onChange={(e) => setDataFim(e.target.value)}
        />
        <Button onClick={carregarLogs} colorScheme="blue" isLoading={loading}>
          Buscar
        </Button>
      </HStack>

      {loading ? (
        <Box textAlign="center" p={10}>
          <Spinner size="lg" color="white" />
        </Box>
      ) : (
      <TableContainer bg="gray.700" p={4} borderRadius="md">
        <Table variant="simple" colorScheme="gray">
          <Thead>
            <Tr>
              <Th color="gray.300">Tipo</Th>
              <Th color="gray.300">Serial</Th>
              <Th color="gray.300">Parâmetro / Evento</Th>
              <Th color="gray.300">Valor / Detalhes</Th>
              <Th color="gray.300">Status</Th>
              <Th color="gray.300">Data</Th>
            </Tr>
          </Thead>
          <Tbody>
            {logs.map((log, index) => (
              <Tr key={index}>
                <Td color="white">
                  <Badge colorScheme={log.tipo === "evento" ? "purple" : "green"}>
                    {log.tipo}
                  </Badge>
                </Td>
                <Td color="white">{log.serial}</Td>
                <Td color="white">{log.evento || log.parametro}</Td>
                <Td color="white">{log.detalhes || log.valor}</Td>
                <Td>
                  {log.status && (
                    <Badge colorScheme={
                      log.status === "ok" ? "green" :
                      log.status === "pendente" ? "yellow" :
                      "red"
                    }>
                      {log.status}
                    </Badge>
                  )}
                </Td>
                <Td color="white">{new Date(log.data).toLocaleString("pt-BR")}</Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </TableContainer>
      )}
    </Box>
  );
}
