// src/components/StatusCard.tsx
import {
  Box,
  Text,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  Progress,
  Spinner,
} from "@chakra-ui/react";
import { useEffect, useMemo, useState } from "react";
import { getDevices } from "../services/genieAcsApi";

interface Device {
  _id: string;
  _lastInform?: string;
}

export default function StatusCard() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await getDevices();
        setDevices(Array.isArray(res) ? res : []);
      } catch (e) {
        console.error("Erro ao carregar devices:", e);
        setDevices([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const { total, onlineNow, seen24h, pct24h } = useMemo(() => {
    const total = devices.length;
    const now = Date.now();

    const onlineNow = devices.filter((d) => {
      if (!d._lastInform) return false;
      const diffMin = (now - new Date(d._lastInform).getTime()) / 60000;
      return diffMin <= 5; // “ativos” nos últimos 5 min
    }).length;

    const seen24h = devices.filter((d) => {
      if (!d._lastInform) return false;
      const diffH = (now - new Date(d._lastInform).getTime()) / (1000 * 60 * 60);
      return diffH <= 24;
    }).length;

    const pct24h = total > 0 ? Math.round((seen24h / total) * 100) : 0;

    return { total, onlineNow, seen24h, pct24h };
  }, [devices]);

  if (loading) {
    return (
      <Box bg="gray.800" p={4} borderRadius="md" textAlign="center">
        <Spinner color="white" />
      </Box>
    );
  }

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
        Status de Dispositivos
      </Text>

      <Stat>
        <StatLabel color="gray.400">Online agora (≤5 min)</StatLabel>
        <StatNumber color="green.300" fontSize="2xl">
          {onlineNow}
        </StatNumber>
        <StatHelpText color="gray.500">Total: {total}</StatHelpText>
      </Stat>

      <Text fontSize="sm" mt={4} color="gray.400">
        Vistos nas últimas 24 horas ({seen24h}/{total})
      </Text>
      <Progress
        value={pct24h}
        colorScheme="teal"
        size="sm"
        mt={2}
        borderRadius="md"
        hasStripe
        isAnimated
      />
    </Box>
  );
}
