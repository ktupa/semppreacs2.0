// src/components/TopModelos.tsx
import { useEffect, useMemo, useState } from "react";
import { Box, Text, Spinner, Progress, VStack, HStack, Badge, Tooltip } from "@chakra-ui/react";
import { getDevices } from "../services/genieAcsApi";

interface CPE {
  _deviceId?: { _ProductClass?: string; _Manufacturer?: string };
  _tags?: string[];
  _lastInform?: string;
}

type Props = {
  onlyOnline?: boolean;     // filtra apenas quem informou recentemente
  sinceMinutes?: number;    // janela de tempo p/ considerar "uso" (default 7 dias)
  requireTag?: string;      // filtrar por uma tag específica (ex: “GNA”)
  limit?: number;           // quantos modelos exibir (default 8)
};

export default function TopModelos({
  onlyOnline = true,
  sinceMinutes = 7 * 24 * 60, // 7 dias
  requireTag,
  limit = 8,
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

  const agrupados = useMemo(() => {
    const mapa: Record<string, { count: number; fabricante?: string }> = {};
    for (const c of filtradas) {
      const modelo = c._deviceId?._ProductClass || "Desconhecido";
      const fab = c._deviceId?._Manufacturer;
      if (!mapa[modelo]) mapa[modelo] = { count: 0, fabricante: fab };
      mapa[modelo].count += 1;
    }
    const pares = Object.entries(mapa)
      .map(([modelo, v]) => ({ modelo, total: v.count, fabricante: v.fabricante }))
      .sort((a, b) => b.total - a.total);

    return pares.slice(0, limit);
  }, [filtradas, limit]);

  const maxCount = useMemo(
    () => (agrupados.length ? Math.max(...agrupados.map((m) => m.total)) : 0),
    [agrupados]
  );

  return (
    <Box bg="gray.800" p={4} borderRadius="xl" border="1px solid" borderColor="cyan.700" boxShadow="lg">
      <HStack justify="space-between" mb={2}>
        <Text fontSize="lg" fontWeight="bold" color="white">
          🏆 Top modelos (no seu contexto)
        </Text>
        <HStack>
          {requireTag && <Badge colorScheme="purple">Tag: {requireTag}</Badge>}
          {onlyOnline && <Badge colorScheme="green">Ativos</Badge>}
          <Badge colorScheme="cyan">Janela: {sinceMinutes} min</Badge>
        </HStack>
      </HStack>

      {loading ? (
        <Spinner color="cyan.400" />
      ) : agrupados.length === 0 ? (
        <Text color="gray.400" fontSize="sm">Sem dados no recorte atual.</Text>
      ) : (
        <VStack spacing={3} align="stretch">
          {agrupados.map((m) => {
            const rel = maxCount ? (m.total / maxCount) * 100 : 0;
            return (
              <Box key={`${m.fabricante ?? "Fab"}-${m.modelo}`}>
                <HStack justify="space-between" mb={1}>
                  <Text color="gray.200" fontSize="sm" noOfLines={1}>
                    <Tooltip label={`${m.fabricante ?? "Fabricante"} • ${m.modelo}`}>
                      <span>{m.fabricante ?? "–"} · <b>{m.modelo}</b></span>
                    </Tooltip>
                  </Text>
                  <Badge colorScheme="cyan">{m.total}</Badge>
                </HStack>
                <Progress value={rel} size="sm" colorScheme="cyan" borderRadius="md" />
              </Box>
            );
          })}
        </VStack>
      )}
    </Box>
  );
}
