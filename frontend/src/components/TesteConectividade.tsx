// src/components/TesteConectividade.tsx
import {
  Box,
  VStack,
  Text,
  HStack,
  Image,
  Badge,
  Button,
  useToast,
  Tooltip,
  Divider,
  Spinner,
} from "@chakra-ui/react";
import { useState } from "react";
import { setParameterValues } from "../services/genieAcsApi";
import TR069Normalizer, { detectDataModel } from "../services/tr069Normalizer";
import { CheckCircle, XCircle, Globe } from "lucide-react";

interface Props {
  /** ID completo da CPE, ex: "3460F9-IGD-22251H2003758" */
  deviceId: string;
  /** Dados do dispositivo para detecção de data model */
  device?: any;
}

interface Servico {
  nome: string;
  icone: string;
  host: string;
}

const SERVICOS: Servico[] = [
  { nome: "Google",    icone: "/icons/google.jpeg",  host: "8.8.8.8" },
  { nome: "Facebook",  icone: "/icons/face.jpeg",    host: "facebook.com" },
  { nome: "Instagram", icone: "/icons/insta.jpeg",   host: "instagram.com" },
  { nome: "Telegram",  icone: "/icons/telegra.jpeg", host: "telegram.org" },
];

type Status = "ok" | "fail" | "loading" | "idle";

export default function TesteConectividade({ deviceId, device }: Props) {
  const [statusMap, setStatusMap] = useState<Record<string, Status>>(
    Object.fromEntries(SERVICOS.map((s) => [s.host, "idle"]))
  );
  const toast = useToast();

  // Detecta o data model do dispositivo
  const dataModel = device ? detectDataModel(device) : "TR-098";

  const testarHostPing = async (host: string) => {
    if (!deviceId) {
      toast({ title: "Nenhum dispositivo selecionado.", status: "warning" });
      return;
    }

    setStatusMap((prev) => ({ ...prev, [host]: "loading" }));

    try {
      // Obtém os caminhos normalizados para o data model do dispositivo
      const hostPath = TR069Normalizer.getPath(device || {}, "diag.ping.host");
      const countPath = TR069Normalizer.getPath(device || {}, "diag.ping.count");
      const statePath = TR069Normalizer.getPath(device || {}, "diag.ping.state");

      // TR-069: setar parâmetros do IPPingDiagnostics com normalização
      await setParameterValues(deviceId, [
        {
          name: hostPath,
          value: host,
          type: "xsd:string",
        },
        {
          name: countPath,
          value: "2",
          type: "xsd:unsignedInt",
        },
        {
          name: statePath,
          value: "Requested",
          type: "xsd:string",
        },
      ]);

      setStatusMap((prev) => ({ ...prev, [host]: "ok" }));
      toast({ 
        title: `Ping solicitado: ${host}`, 
        description: `Data Model: ${dataModel}`,
        status: "success" 
      });
    } catch (error: any) {
      console.error("Erro ao testar", host, error);
      setStatusMap((prev) => ({ ...prev, [host]: "fail" }));
      toast({
        title: `Falha ao solicitar ping para ${host}`,
        description: String(error?.message || error),
        status: "error",
      });
    }
  };

  const renderStatusIcon = (status: Status) => {
    switch (status) {
      case "ok":
        return <CheckCircle color="#48BB78" size={18} />;
      case "fail":
        return <XCircle color="#F56565" size={18} />;
      case "loading":
        return <Spinner size="sm" color="yellow.300" />;
      default:
        return <Globe color="#A0AEC0" size={18} />;
    }
  };

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
        🌐 Testes de Conectividade (Ping via TR-069)
      </Text>
      <Divider mb={3} borderColor="gray.700" />

      <VStack spacing={4} align="stretch">
        {SERVICOS.map((s) => (
          <HStack
            key={s.nome}
            justify="space-between"
            bg="gray.700"
            p={3}
            borderRadius="md"
            _hover={{ bg: "gray.600" }}
          >
            <HStack spacing={3}>
              <Image boxSize="20px" borderRadius="full" src={s.icone} alt={s.nome} />
              <Text color="white" fontSize="sm">
                {s.nome}
              </Text>
            </HStack>

            <HStack spacing={3}>
              <Tooltip label={`Host: ${s.host}`}>
                <Badge
                  px={2}
                  py={1}
                  borderRadius="md"
                  colorScheme={
                    statusMap[s.host] === "ok"
                      ? "green"
                      : statusMap[s.host] === "fail"
                      ? "red"
                      : statusMap[s.host] === "loading"
                      ? "yellow"
                      : "gray"
                  }
                >
                  {statusMap[s.host] === "ok"
                    ? "OK"
                    : statusMap[s.host] === "fail"
                    ? "Falha"
                    : statusMap[s.host] === "loading"
                    ? "Testando..."
                    : "Aguardando"}
                </Badge>
              </Tooltip>

              <Button
                size="sm"
                colorScheme="teal"
                variant="outline"
                onClick={() => testarHostPing(s.host)}
                isDisabled={statusMap[s.host] === "loading"}
              >
                Testar
              </Button>

              {renderStatusIcon(statusMap[s.host])}
            </HStack>
          </HStack>
        ))}
      </VStack>
    </Box>
  );
}
