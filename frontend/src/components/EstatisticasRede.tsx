// src/components/EstatisticasRede.tsx

import {
  Box,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  SimpleGrid,
  Text,
  Spinner,
} from "@chakra-ui/react";
import { useEffect, useState } from "react";
import {
  FaArrowUp,
  FaArrowDown,
  FaGlobeAmericas,
} from "react-icons/fa";
import { fetchDevices } from "../services/genieAcsApi";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";

interface GraficoDiario {
  dia: string;
  upload: number;
  download: number;
}

export default function EstatisticasRede() {
  const [qtdIpv6, setQtdIpv6] = useState(0);
  const [qtdDispositivos, setQtdDispositivos] = useState(0);
  const [totalUp, setTotalUp] = useState(0);
  const [totalDown, setTotalDown] = useState(0);
  const [dadosGrafico, setDadosGrafico] = useState<GraficoDiario[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function carregar() {
      try {
        const dispositivos = await fetchDevices();
        let ipv6Ativos = 0;
        let totalUpload = 0;
        let totalDownload = 0;

        dispositivos.forEach((d: any) => {
          const p = d.Device;

          // Em vez de checar X_TP_IPv6Enabled, verificamos se há um Default IPv6 Gateway
          const ipv6Gateway =
            p?.WANDevice?.[1]?.WANConnectionDevice?.[1]?.WANPPPConnection?.[1]
              ?.X_TP_DefaultIPv6Gateway?._value;
          const ipv6Habilitado = ipv6Gateway && ipv6Gateway !== "::" ? true : false;
    
          if (ipv6Habilitado) {
            ipv6Ativos++;
          }
    
          // Coleta estatísticas globais de uso
          const stats =
            p?.WLANConfiguration?.[1]?.Stats ||
            p?.WANDevice?.[1]?.WANConnectionDevice?.[1]?.WANPPPConnection?.[1]
              ?.Stats;
    
          const up = parseInt(stats?.TotalBytesSent?._value || "0", 10);
          const down = parseInt(stats?.TotalBytesReceived?._value || "0", 10);
    
          totalUpload += up;
          totalDownload += down;
        });
    
        setQtdDispositivos(dispositivos.length);
        setQtdIpv6(ipv6Ativos);
        setTotalUp(totalUpload);
        setTotalDown(totalDown);
    
        // Simulação do gráfico (substitua por dados reais quando disponível)
        const dias = Array.from({ length: 7 }, (_, i) =>
          new Date(Date.now() - (6 - i) * 86400000).toISOString().slice(0, 10)
        );
        const grafico: GraficoDiario[] = dias.map((dia) => ({
          dia,
          upload: Math.floor(Math.random() * 300),
          download: Math.floor(Math.random() * 500),
        }));
        setDadosGrafico(grafico);
      } catch (err) {
        console.error("Erro ao buscar estatísticas de rede:", err);
      } finally {
        setLoading(false);
      }
    }
  
    carregar();
  }, []);

  const formatarBytes = (valor: number) => {
    if (valor < 1024 * 1024) return `${(valor / 1024).toFixed(1)} KB`;
    if (valor < 1024 * 1024 * 1024)
      return `${(valor / (1024 * 1024)).toFixed(1)} MB`;
    return `${(valor / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  return (
    <Box bg="gray.800" p={5} borderRadius="2xl" boxShadow="md" w="full">
      <Text fontSize="xl" fontWeight="bold" color="white" mb={4}>
        Estatísticas da Rede
      </Text>

      {loading ? (
        <Spinner color="white" size="lg" />
      ) : (
        <>
          <SimpleGrid columns={{ base: 1, md: 2, lg: 4 }} spacing={6} mb={8}>
            <Stat>
              <StatLabel color="gray.400">Dispositivos Cadastrados</StatLabel>
              <StatNumber color="white">{qtdDispositivos}</StatNumber>
              <StatHelpText color="gray.500">Total no ACS</StatHelpText>
            </Stat>

            <Stat>
              <StatLabel color="gray.400">IPv6 Ativos</StatLabel>
              <StatNumber color="teal.300">
                <FaGlobeAmericas style={{ marginRight: 4 }} />
                {qtdIpv6}
              </StatNumber>
              <StatHelpText color="gray.500">
                Dispositivos com Gateway IPv6 configurado
              </StatHelpText>
            </Stat>

            <Stat>
              <StatLabel color="gray.400">Upload Total</StatLabel>
              <StatNumber color="teal.300">
                <FaArrowUp style={{ marginRight: 4 }} />
                {formatarBytes(totalUp)}
              </StatNumber>
            </Stat>

            <Stat>
              <StatLabel color="gray.400">Download Total</StatLabel>
              <StatNumber color="teal.300">
                <FaArrowDown style={{ marginRight: 4 }} />
                {formatarBytes(totalDown)}
              </StatNumber>
            </Stat>
          </SimpleGrid>

          <Box w="full" h="300px">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dadosGrafico}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="dia" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="upload"
                  stroke="#00B5D8"
                  name="Upload (MB)"
                />
                <Line
                  type="monotone"
                  dataKey="download"
                  stroke="#38A169"
                  name="Download (MB)"
                />
              </LineChart>
            </ResponsiveContainer>
          </Box>
        </>
      )}
    </Box>
  );
}
