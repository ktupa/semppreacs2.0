// src/components/ResumoRede.tsx
import { Flex, Stat, StatLabel, StatNumber, Spinner, Box } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { getDevices } from "../services/genieAcsApi";

interface Device {
  _id: string;
  _lastInform?: string;
}

export default function ResumoRede() {
  const [total, setTotal] = useState(0);
  const [online, setOnline] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function carregar() {
      try {
        const devices: Device[] = await getDevices();
        const agora = new Date().getTime();

        // dispositivos que informaram nos últimos 5 minutos
        const ativos = (Array.isArray(devices) ? devices : []).filter((d) => {
          const inform = d._lastInform;
          if (!inform) return false;
          const diff = (agora - new Date(inform).getTime()) / 60000;
          return diff <= 5;
        });

        setTotal(devices.length);
        setOnline(ativos.length);
      } catch (err) {
        console.error("Erro ao carregar resumo da rede:", err);
        setTotal(0);
        setOnline(0);
      } finally {
        setLoading(false);
      }
    }

    carregar();
  }, []);

  if (loading)
    return (
      <Box p={4} bg="gray.800" borderRadius="md" textAlign="center">
        <Spinner color="white" />
      </Box>
    );

  return (
    <Flex
      bg="gray.800"
      p={5}
      borderRadius="xl"
      border="1px solid"
      borderColor="cyan.700"
      justify="space-between"
      align="center"
      boxShadow="lg"
    >
      <Stat>
        <StatLabel color="cyan.200" fontWeight="semibold">Total de CPEs</StatLabel>
        <StatNumber color="white" fontSize="2xl">
          {total}
        </StatNumber>
      </Stat>

      <Stat>
        <StatLabel color="cyan.200" fontWeight="semibold">Online</StatLabel>
        <StatNumber color="green.400" fontSize="2xl">
          {online}
        </StatNumber>
      </Stat>

      <Stat>
        <StatLabel color="cyan.200" fontWeight="semibold">Offline</StatLabel>
        <StatNumber color="red.400" fontSize="2xl">
          {total - online}
        </StatNumber>
      </Stat>
    </Flex>
  );
}
