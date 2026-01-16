// src/components/UsoSistema.tsx
import { useEffect, useMemo, useState } from "react";
import {
  Box, Text, Badge, HStack, Select, NumberInput, NumberInputField,
  VStack, Skeleton, Wrap, WrapItem
} from "@chakra-ui/react";
import { getTasks } from "../services/genieAcsApi";

interface Usuario {
  nome: string;
  interacoes: number;
}
interface Task {
  timestamp?: string;
  name?: string;
  custom?: { usuario?: string };
}

type Props = {
  sinceMinutes?: number;   // janela padrão 7 dias
  actionFilter?: string;   // filtrar por nome de task (ex: "reboot")
  limitTop?: number;       // quantos usuários mostrar como "top"
};

export default function UsoSistema({
  sinceMinutes = 7 * 24 * 60,
  actionFilter = "",
  limitTop = 12,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [janela, setJanela] = useState(sinceMinutes);
  const [acao, setAcao] = useState(actionFilter);

  useEffect(() => {
    (async () => {
      try {
        const since = new Date(Date.now() - janela * 60 * 1000).toISOString();
        // Busca por janela
        const tasks: Task[] = await getTasks({ timestamp: { $gte: since } });

        const filtradas = tasks.filter((t) =>
          acao ? (t.name || "").toLowerCase() === acao.toLowerCase() : true
        );

        const contador: Record<string, number> = {};
        for (const t of filtradas) {
          const nome = t?.custom?.usuario?.trim() || "Desconhecido";
          contador[nome] = (contador[nome] || 0) + 1;
        }

        const lista = Object.entries(contador)
          .map(([nome, interacoes]) => ({ nome, interacoes }))
          .sort((a, b) => b.interacoes - a.interacoes);

        setUsuarios(lista);
      } catch (e) {
        setUsuarios([]);
        console.error("Erro ao carregar uso do sistema:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [janela, acao]);

  const maisAtivo = useMemo(() => usuarios[0] || null, [usuarios]);

  return (
    <Box bg="gray.800" p={4} borderRadius="lg" border="1px solid" borderColor="gray.700">
      <HStack justify="space-between" mb={3}>
        <Text fontSize="lg" fontWeight="bold" color="white">
          📊 Uso do sistema
        </Text>
        <HStack spacing={3}>
          <HStack>
            <Text color="gray.400" fontSize="sm">Ação:</Text>
            <Select
              size="sm"
              bg="gray.700"
              value={acao}
              onChange={(e) => setAcao(e.target.value)}
            >
              <option style={{ background: "#555" }} value="">Todas</option>
              <option style={{ background: "#555" }} value="reboot">reboot</option>
              <option style={{ background: "#555" }} value="download">download</option>
              <option style={{ background: "#555" }} value="setParameterValues">setParameterValues</option>
              <option style={{ background: "#555" }} value="factoryReset">factoryReset</option>
            </Select>
          </HStack>
          <HStack>
            <Text color="gray.400" fontSize="sm">Janela (min):</Text>
            <NumberInput
              size="sm"
              min={5}
              max={60*24*30}
              value={janela}
              onChange={(_, v) => setJanela(Number.isFinite(v) ? v : janela)}
            >
              <NumberInputField bg="gray.700" />
            </NumberInput>
          </HStack>
        </HStack>
      </HStack>

      {loading ? (
        <VStack align="start" spacing={2}>
          <Skeleton h="18px" w="60%" />
          <Skeleton h="18px" w="40%" />
          <Skeleton h="28px" w="100%" />
        </VStack>
      ) : usuarios.length === 0 ? (
        <Text color="gray.400" fontSize="sm">Sem interações na janela atual.</Text>
      ) : (
        <>
          <Text color="white" fontSize="md">
            <strong>{maisAtivo?.nome}</strong> foi o usuário mais ativo ({maisAtivo?.interacoes})
          </Text>
          <Text fontSize="sm" color="gray.400" mt={1}>
            Usuários ativos: {usuarios.length}
          </Text>
          <Box mt={3}>
            <Text fontSize="sm" color="gray.300">
              Interações por usuário:
            </Text>
            <Wrap mt={2} spacing={2}>
              {usuarios.slice(0, limitTop).map((u, i) => (
                <WrapItem key={`${u.nome}-${i}`}>
                  <Badge colorScheme={i === 0 ? "teal" : "blue"} variant="solid">
                    {u.nome} ({u.interacoes})
                  </Badge>
                </WrapItem>
              ))}
            </Wrap>
          </Box>
        </>
      )}
    </Box>
  );
}
