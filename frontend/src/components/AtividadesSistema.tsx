// src/components/AtividadesSistema.tsx
import { useEffect, useRef, useState } from "react";
import {
  Box,
  Text,
  List,
  ListItem,
  Spinner,
  Badge,
  Heading,
  HStack,
  Button,
  Alert,
  AlertIcon,
  Flex,
  Divider,
} from "@chakra-ui/react";
import { getTasksRecent, getErrorsRecent } from "../services/genieAcsApi";

const REFRESH_MS = 60_000;

export default function AtividadesSistema() {
  const [tarefas, setTarefas] = useState<any[]>([]);
  const [erros, setErros] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  const carregar = async () => {
    try {
      setErr(null);
      setLoading(true);
      const [resTarefas, resErros] = await Promise.all([
        getTasksRecent(5),
        getErrorsRecent(5),
      ]);
      setTarefas(resTarefas || []);
      setErros(resErros || []);
    } catch (e) {
      setErr("Erro ao buscar atividades do sistema.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregar();
    timerRef.current = window.setInterval(carregar, REFRESH_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  if (loading) return <Spinner color="white" />;

  return (
    <Box>
      <Flex align="center" justify="space-between" mb={2}>
        <Heading as="h3" fontSize="md" color="white">
          ⚙️ Atividades Recentes
        </Heading>
        <HStack>
          <Button size="xs" variant="outline" onClick={carregar}>
            Atualizar
          </Button>
        </HStack>
      </Flex>

      {err && (
        <Alert status="error" borderRadius="md" bg="red.700" mb={3}>
          <AlertIcon />
          {err}
        </Alert>
      )}

      {/* TAREFAS */}
      <Text fontSize="sm" color="gray.400" mb={2}>
        Últimas Tarefas Agendadas
      </Text>
      <List spacing={1} mb={4}>
        {tarefas.length === 0 ? (
          <Text fontSize="sm" color="gray.500">
            Nenhuma tarefa recente.
          </Text>
        ) : (
          tarefas.map((t) => (
            <ListItem key={t._id}>
              <Badge colorScheme="blue" mr={2}>
                {t.name}
              </Badge>
              <Text as="span" color="white" fontSize="sm">
                {t.device}
              </Text>{" "}
              <Text as="span" color="gray.400" fontSize="xs">
                {new Date(t.timestamp).toLocaleString()}
              </Text>
            </ListItem>
          ))
        )}
      </List>

      <Divider my={3} borderColor="gray.600" />

      {/* ERROS */}
      <Text fontSize="sm" color="gray.400" mb={2}>
        Últimos Erros Reportados
      </Text>
      <List spacing={1}>
        {erros.length === 0 ? (
          <Text fontSize="sm" color="gray.500">
            Nenhum erro recente.
          </Text>
        ) : (
          erros.map((e) => (
            <ListItem key={e._id}>
              <Badge colorScheme="red" mr={2}>
                Erro {e.faultCode}
              </Badge>
              <Text as="span" color="white" fontSize="sm">
                {e.faultString}
              </Text>{" "}
              <Text as="span" color="gray.400" fontSize="xs">
                {new Date(e.timestamp).toLocaleString()}
              </Text>
            </ListItem>
          ))
        )}
      </List>
    </Box>
  );
}
