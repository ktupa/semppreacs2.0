// src/components/StatusDispositivos.tsx
import { useEffect, useState } from "react";
import {
  Box,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  Progress,
  Text,
  Spinner,
} from "@chakra-ui/react";
import { getDevices } from "../services/genieAcsApi";

interface CPE {
  _id: string;
  _lastInform?: string;
}

export default function StatusDispositivos() {
  const [online, setOnline] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function carregar() {
      try {
        const res: CPE[] = await getDevices();
        const agora = Date.now();
        const cincoMin = 5 * 60 * 1000;

        const ativos = res.filter((cpe) => {
          if (!cpe._lastInform) return false;
          const diff = agora - new Date(cpe._lastInform).getTime();
          return diff <= cincoMin;
        });

        setTotal(res.length);
        setOnline(ativos.length);
      } catch (err) {
        console.error("Erro ao buscar dispositivos:", err);
        setOnline(0);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    }

    carregar();
  }, []);

  const percentualOnline = total > 0 ? (online / total) * 100 : 0;

  return (
    <Box
      bg="gray.800"
      p={5}
      borderRadius="xl"
      border="1px solid"
      borderColor="cyan.700"
      boxShadow="lg"
    >
      <Text fontSize="lg" fontWeight="bold" mb={3} color="white">
        ⚙️ Status de Dispositivos
      </Text>

      {loading ? (
        <Spinner color="cyan.400" />
      ) : (
        <>
          <Stat>
            <StatLabel color="cyan.200" fontWeight="semibold">Online</StatLabel>
            <StatNumber color="green.400" fontSize="2xl">
              {online}
            </StatNumber>
            <StatHelpText color="gray.400">Total: {total}</StatHelpText>
          </Stat>

          <Text fontSize="sm" mt={4} color="gray.300">
            Ativos nos últimos 5 minutos
          </Text>

          <Progress
            colorScheme="cyan"
            value={percentualOnline}
            size="sm"
            mt={2}
            borderRadius="md"
            hasStripe
            isAnimated
          />
        </>
      )}
    </Box>
  );
}
