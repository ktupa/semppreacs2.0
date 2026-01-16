// src/components/ResumoSistema.tsx
import {
  Box,
  Text,
  List,
  ListItem,
  Spinner,
  Badge,
  VStack,
  HStack,
  Divider,
  Center,
} from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { Activity, AlertTriangle } from "lucide-react";
import { getTasksRecent, getErrorsRecent } from "../services/genieAcsApi";

export default function ResumoSistema() {
  const [tarefas, setTarefas] = useState<any[]>([]);
  const [erros, setErros] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getTasksRecent(10),
      getErrorsRecent(10),
    ])
      .then(([resTarefas, resErros]) => {
        setTarefas(resTarefas || []);
        setErros(resErros || []);
      })
      .catch((err) => {
        console.error("Erro ao carregar dados do sistema:", err);
        setTarefas([]);
        setErros([]);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading)
    return (
      <Box bg="gray.800" p={4} borderRadius="md" textAlign="center">
        <Spinner color="white" />
      </Box>
    );

  return (
    <Box
      bg="gray.800"
      p={5}
      borderRadius="lg"
      border="1px solid"
      borderColor="gray.700"
      boxShadow="lg"
    >
      <Text fontSize="lg" fontWeight="bold" mb={3} color="white">
        🧩 Resumo do Sistema
      </Text>

      {/* === TAREFAS === */}
      <VStack align="start" spacing={2}>
        <HStack>
          <Activity size={16} color="#63B3ED" />
          <Text fontSize="sm" color="gray.400">
            Tarefas Recentes
          </Text>
        </HStack>

        <List spacing={1} w="full">
          {tarefas.length === 0 ? (
            <Center py={2}>
              <Text fontSize="xs" color="gray.500">
                Nenhuma tarefa encontrada.
              </Text>
            </Center>
          ) : (
            tarefas.slice(0, 5).map((t, i) => (
              <ListItem
                key={i}
                fontSize="sm"
                color="white"
                _hover={{ color: "blue.300" }}
              >
                <Badge colorScheme="blue" mr={2}>
                  {t.name}
                </Badge>
                {t.device}
              </ListItem>
            ))
          )}
        </List>
      </VStack>

      <Divider my={4} borderColor="gray.600" />

      {/* === ERROS === */}
      <VStack align="start" spacing={2}>
        <HStack>
          <AlertTriangle size={16} color="#FC8181" />
          <Text fontSize="sm" color="gray.400">
            Erros Recentes
          </Text>
        </HStack>

        <List spacing={1} w="full">
          {erros.length === 0 ? (
            <Center py={2}>
              <Text fontSize="xs" color="gray.500">
                Sem erros recentes.
              </Text>
            </Center>
          ) : (
            erros.slice(0, 5).map((e, i) => (
              <ListItem key={i} fontSize="sm" color="red.300">
                {e.device} — {e.message}
              </ListItem>
            ))
          )}
        </List>
      </VStack>
    </Box>
  );
}
