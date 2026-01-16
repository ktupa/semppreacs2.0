// src/components/UsoDispositivos.tsx
import { useEffect, useMemo, useState } from "react";
import { Box, Text, Progress, Spinner, HStack, Badge, VStack, Tooltip } from "@chakra-ui/react";
import { getDevices } from "../services/genieAcsApi";

interface CPE {
  _deviceId?: { _ProductClass?: string; _Manufacturer?: string };
  _tags?: string[];
  _lastInform?: string;
}

type Props = {
  onlyOnline?: boolean;     // considera só quem informou na janela
  sinceMinutes?: number;    // janela em minutos (default 60)
  requireTag?: string;      // filtrar por tag
  limit?: number;           // quantos modelos mostrar
};

export default function UsoDispositivos({
  onlyOnline = true,
  sinceMinutes = 60, // 1 hora por padrão: “uso” mais dinâmico
  requireTag,
  limit = 10,
}: Props) {
  const [cpes, setCpes] = useState<CPE[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res: CPE[] = await getDevices();
        setCpes(Array.isArray(res) ? res : []);
      } catch {
        setCpes([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtradas = useMemo(() => {
    const now = Date.now();
    const msWin = sinceMinutes * 60 * 1000;

    return cpes.filter((cpe) => {
      if (requireTag && !cpe._tags?.includes(requireTag)) return false;

      if (onlyOnline) {
        if (!cpe._lastInform) return false;
        const diff = now - new Date(cpe._lastInform).getTime();
        if (diff > msWin) return false;
      }
      return true;
    });
  }, [cpes, onlyOnline, sinceMinutes, requireTag]);

  // Contagem por modelo dentro do recorte atual (escopo local, não global)
  const modelos = useMemo(() => {
    const cont: Record<string, { total: number; fab?: string }> = {};
    for (const c of filtradas) {
      const modelo = c._deviceId?._ProductClass || "Desconhecido";
      const fab = c._deviceId?._Manufacturer;
      if (!cont[modelo]) cont[modelo] = { total: 0, fab };
      cont[modelo].total += 1;
    }
    return Object.entries(cont)
      .map(([modelo, v]) => ({ modelo, total: v.total, fabricante: v.fab }))
      .sort((a, b) => b.total - a.total)
      .slice(0, limit);
  }, [filtradas, limit]);

  const totalLocal = modelos.reduce((acc, m) => acc + m.total, 0);
  const maxLocal = modelos.length ? Math.max(...modelos.map((m) => m.total)) : 0;

  return (
    <Box bg="gray.800" p={4} borderRadius="lg" border="1px solid" borderColor="gray.700" boxShadow="lg">
      <HStack justify="space-between" mb={2}>
        <Text fontSize="lg" fontWeight="bold" color="white">
          📈 Uso por dispositivo (recorte local)
        </Text>
        <HStack>
          {requireTag && <Badge colorScheme="purple">Tag: {requireTag}</Badge>}
          {onlyOnline && <Badge colorScheme="green">Ativos</Badge>}
          <Badge colorScheme="blue">Janela: {sinceMinutes} min</Badge>
        </HStack>
      </HStack>

      {loading ? (
        <Spinner color="teal.300" />
      ) : modelos.length === 0 ? (
        <Text color="gray.400" fontSize="sm">Sem dispositivos no recorte.</Text>
      ) : (
        <VStack spacing={3} align="stretch">
          {modelos.map((m) => {
            const pctRelTop = maxLocal ? (m.total / maxLocal) * 100 : 0;     // barra relativa ao top do recorte
            const shareLocal = totalLocal ? Math.round((m.total / totalLocal) * 100) : 0; // % dentro do recorte

            return (
              <Box key={`${m.fabricante ?? "Fab"}-${m.modelo}`}>
                <HStack justify="space-between" mb={1}>
                  <Text color="gray.200" fontSize="sm" noOfLines={1}>
                    <Tooltip label={`${m.fabricante ?? "Fabricante"} • ${m.modelo}`}>
                      <span>{m.fabricante ?? "–"} · <b>{m.modelo}</b></span>
                    </Tooltip>
                  </Text>
                  <HStack>
                    <Badge colorScheme="teal">{m.total}</Badge>
                    <Badge colorScheme="gray">{shareLocal}%</Badge>
                  </HStack>
                </HStack>
                <Progress value={pctRelTop} size="sm" colorScheme="teal" borderRadius="md" />
              </Box>
            );
          })}
        </VStack>
      )}
    </Box>
  );
}
