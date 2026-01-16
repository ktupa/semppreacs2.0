import { useEffect, useState } from "react";
import {
  Box,
  Text,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer,
  Badge,
  Spinner
} from "@chakra-ui/react";
import { getDevices } from "../services/genieAcsApi";

interface Acesso {
  ip: string;
  equipamento: string;
  status: string;
  lastInform?: string;
}

export default function HistoricoAcesso() {
  const [acessos, setAcessos] = useState<Acesso[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDevices()
      .then((devices) => {
        // Transformar dispositivos em formato de acesso
        const acessosList: Acesso[] = devices
          .slice(0, 10) // Últimos 10
          .map((d: any) => {
            const lastInform = d._lastInform ? new Date(d._lastInform) : null;
            const isOnline = lastInform && (Date.now() - lastInform.getTime()) < 5 * 60 * 1000; // 5 min
            
            // Tenta obter IP do dispositivo
            const wanIp = 
              d?.InternetGatewayDevice?.WANDevice?.[1]?.WANConnectionDevice?.[1]?.WANPPPConnection?.[1]?.ExternalIPAddress?._value ||
              d?.Device?.PPP?.Interface?.[1]?.IPCP?.LocalIPAddress?._value ||
              'N/A';
              
            return {
              ip: wanIp,
              equipamento: `${d._deviceId?._Manufacturer || 'Unknown'} ${d._deviceId?._ProductClass || ''}`.trim(),
              status: isOnline ? 'online' : 'offline',
              lastInform: d._lastInform,
            };
          })
          .sort((a, b) => new Date(b.lastInform || 0).getTime() - new Date(a.lastInform || 0).getTime());
        
        setAcessos(acessosList);
      })
      .catch((err) => {
        console.error("Erro ao buscar acessos:", err);
        setAcessos([]);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <Box bg="gray.800" p={4} borderRadius="md">
      <Text fontSize="lg" fontWeight="bold" mb={2}>
        🕓 Últimos acessos
      </Text>
      {loading ? (
        <Spinner color="white" />
      ) : (
        <TableContainer>
          <Table variant="simple" size="sm">
            <Thead>
              <Tr>
                <Th color="gray.300">IP</Th>
                <Th color="gray.300">Equipamento</Th>
                <Th color="gray.300">Status</Th>
              </Tr>
            </Thead>
            <Tbody>
              {acessos.map((item, idx) => (
                <Tr key={idx}>
                  <Td>{item.ip}</Td>
                  <Td>{item.equipamento}</Td>
                  <Td>
                    <Badge colorScheme={item.status === "online" ? "green" : "red"}>
                      {item.status.toUpperCase()}
                    </Badge>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}
