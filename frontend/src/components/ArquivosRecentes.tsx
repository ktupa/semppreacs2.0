// src/components/ArquivosRecentes.tsx
import { useEffect, useRef, useState } from "react";
import {
  Box,
  Text,
  Spinner,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  HStack,
  Button,
  Badge,
  Alert,
  AlertIcon,
  Flex,
} from "@chakra-ui/react";
import { getFiles } from "../services/genieAcsApi";

const REFRESH_MS = 60_000; // 60s
const ROW_LIMIT = 10;

export default function ArquivosRecentes() {
  const [arquivos, setArquivos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  const fetchFiles = async () => {
    try {
      setErr(null);
      setLoading(true);
      // via genieAcsApi → Genie FS
      const data = await getFiles();
      // Ordenar por timestamp e limitar
      const sorted = Array.isArray(data) 
        ? data.sort((a, b) => new Date(b._timestamp || 0).getTime() - new Date(a._timestamp || 0).getTime()).slice(0, ROW_LIMIT)
        : [];
      setArquivos(sorted);
    } catch {
      setErr("Não foi possível carregar os arquivos recentes.");
      setArquivos([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles();
    timerRef.current = window.setInterval(fetchFiles, REFRESH_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fmtTipo = (t?: string) => t?.split(" ").slice(1).join(" ") || "-";
  const tipoColor = (t?: string) =>
    /Firmware/i.test(t || "") ? "purple" :
    /Config|Configuration/i.test(t || "") ? "blue" :
    /Image|Upgrade/i.test(t || "") ? "orange" :
    "gray";

  return (
    <Box>
      <Flex align="center" justify="space-between" mb={2}>
        <Text fontSize="lg" fontWeight="bold" color="white">
          Arquivos Recentes
        </Text>
        <HStack spacing={2}>
          <Button size="xs" variant="outline" onClick={fetchFiles}>
            Atualizar
          </Button>
          <Button
            size="xs"
            colorScheme="teal"
            variant="outline"
            onClick={() => window.open("/genie-ui/#/files", "_blank")}
          >
            Abrir no Genie UI
          </Button>
        </HStack>
      </Flex>

      {err && (
        <Alert status="error" mb={3} borderRadius="md" bg="red.700">
          <AlertIcon />
          {err}
        </Alert>
      )}

      {loading ? (
        <HStack>
          <Spinner color="white" />
          <Text color="gray.300" fontSize="sm">Carregando…</Text>
        </HStack>
      ) : arquivos.length === 0 ? (
        <Text color="gray.400" fontSize="sm">Nenhum arquivo encontrado.</Text>
      ) : (
        <Table size="sm" variant="simple" colorScheme="gray">
          <Thead>
            <Tr>
              <Th color="gray.400">Nome</Th>
              <Th color="gray.400">Tipo</Th>
              <Th color="gray.400">Versão</Th>
              <Th color="gray.400">Data</Th>
            </Tr>
          </Thead>
          <Tbody>
            {arquivos.map((f) => (
              <Tr key={f._id}>
                <Td color="white">{f.filename || "-"}</Td>
                <Td>
                  <Badge colorScheme={tipoColor(f.fileType)}>{fmtTipo(f.fileType)}</Badge>
                </Td>
                <Td color="white">{f.version || "-"}</Td>
                <Td color="white">
                  {f._timestamp ? new Date(f._timestamp).toLocaleString() : "-"}
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </Box>
  );
}
