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
      borderRadius="lg"
      border="1px solid"
      borderColor="gray.700"
      boxShadow="lg"
    >
      <Text fontSize="lg" fontWeight="bold" mb={3} color="white">
        ⚙️ Status de Dispositivos
      </Text>

      {loading ? (
        <Spinner color="teal.300" />
      ) : (
        <>
          <Stat>
            <StatLabel color="gray.400">Online</StatLabel>
            <StatNumber color="green.300" fontSize="2xl">
              {online}
            </StatNumber>
            <StatHelpText color="gray.500">Total: {total}</StatHelpText>
          </Stat>

          <Text fontSize="sm" mt={4} color="gray.400">
            Ativos nos últimos 5 minutos
          </Text>

          <Progress
            colorScheme="teal"
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
