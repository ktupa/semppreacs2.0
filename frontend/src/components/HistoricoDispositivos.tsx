// src/components/HistoricoDispositivos.tsx
import { useEffect, useState } from "react";
import {
  Box, Table, Thead, Tr, Th, Tbody, Td, Badge,
  Text, Spinner, Button,
} from "@chakra-ui/react";
import { useNavigate } from "react-router-dom";
import { getDevices } from "../services/genieAcsApi";

interface CPE {
  _id: string;
  _lastInform?: string;
  _tags?: string[];
  _deviceId: {
    _SerialNumber?: string;
    _Manufacturer?: string;
    _ProductClass?: string;
  };
  InternetGatewayDevice?: any;
}

export default function HistoricoDispositivos() {
  const [dispositivos, setDispositivos] = useState<CPE[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    async function carregar() {
      try {
        const res = await getDevices();
        setDispositivos(res.slice(0, 10));
      } catch (err) {
        console.error("Erro ao buscar CPEs:", err);
        setDispositivos([]);
      } finally {
        setLoading(false);
      }
    }
    carregar();
  }, []);

  const verificarStatus = (lastInform?: string) => {
    if (!lastInform) return "offline";
    const agora = Date.now();
    const informado = new Date(lastInform).getTime();
    const diffMin = (agora - informado) / 60000;
    return diffMin <= 5 ? "online" : "offline";
  };

  return (
    <Box bg="gray.800" p={4} borderRadius="md" mt={4}>
      <Text fontSize="lg" fontWeight="bold" mb={2} color="white">
        Histórico de Dispositivos (últimos 10)
      </Text>

      {loading ? (
        <Spinner color="white" />
      ) : (
        <Table variant="simple" colorScheme="gray" size="sm">
          <Thead>
            <Tr>
              <Th color="gray.400">Login</Th>
              <Th color="gray.400">Modelo</Th>
              <Th color="gray.400">Fabricante</Th>
              <Th color="gray.400">Tag</Th>
              <Th color="gray.400">Status</Th>
              <Th color="gray.400">Ações</Th>
            </Tr>
          </Thead>
          <Tbody>
            {dispositivos.map((cpe) => {
              const login = cpe?.InternetGatewayDevice?.WANDevice?.["1"]
                ?.WANConnectionDevice?.["1"]?.WANPPPConnection?.["1"]?.Username?._value || "-";
              const status = verificarStatus(cpe._lastInform);
              const modelo = cpe._deviceId?._ProductClass || "-";
              const fabricante = cpe._deviceId?._Manufacturer || "-";
              const tag = cpe?._tags?.[0] || "-";

              // Usa SEMPRE o _id vindo da API
              const deviceId = cpe._id;

              return (
                <Tr key={cpe._id}>
                  <Td color="white" fontWeight="bold">{login}</Td>
                  <Td color="white">{modelo}</Td>
                  <Td color="white">{fabricante}</Td>
                  <Td><Badge colorScheme="blue">{tag}</Badge></Td>
                  <Td>
                    <Badge colorScheme={status === "online" ? "green" : "red"}>
                      {status.toUpperCase()}
                    </Badge>
                  </Td>
                  <Td>
                    <Button
                      size="xs"
                      colorScheme="blue"
                      onClick={() => navigate(`/devices/${encodeURIComponent(deviceId)}`)}
                    >
                      Ver
                    </Button>
                  </Td>
                </Tr>
              );
            })}
          </Tbody>
        </Table>
      )}
    </Box>
  );
}
