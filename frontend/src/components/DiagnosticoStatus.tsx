// src/components/DiagnosticoStatus.tsx
import {
  Box,
  Heading,
  Text,
  Badge,
  VStack,
  Spinner,
  useToast,
  HStack,
  Divider,
  useColorModeValue,
} from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { enviarDownloadDiagnostics } from "../services/genieAcsApi";
import { Download, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

interface DiagnosticoStatusProps {
  device: any;
}

export default function DiagnosticoStatus({ device }: DiagnosticoStatusProps) {
  const [status, setStatus] = useState<string | null>(null);
  const toast = useToast();

  const bg = useColorModeValue("gray.800", "gray.800");
  const borderColor = useColorModeValue("gray.700", "gray.700");
  const textColor = useColorModeValue("white", "whiteAlpha.900");

  useEffect(() => {
    const executarDiagnostico = async () => {
      // Usar device._id diretamente (formato correto do GenieACS)
      if (!device?._id) {
        setStatus("❌ Dados da CPE incompletos");
        return;
      }

      const deviceId = device._id;
      setStatus("⏳ Enviando comando DownloadDiagnostics...");

      try {
        await enviarDownloadDiagnostics(deviceId);
        setStatus("✅ Comando enviado com sucesso");
        toast({
          title: "Comando enviado!",
          description: "O diagnóstico TR-069 foi iniciado com sucesso.",
          status: "success",
          duration: 4000,
          isClosable: true,
        });
      } catch (error: any) {
        const erro = error?.response?.data?.detail || error?.message || "Erro desconhecido";
        setStatus(`❌ Falha: ${erro}`);
        toast({
          title: "Erro ao enviar diagnóstico",
          description: erro,
          status: "error",
          duration: 6000,
          isClosable: true,
        });
      }
    };

    executarDiagnostico();
  }, [device, toast]);

  const renderIcon = (text: string | null) => {
    if (!text) return <Loader2 size={20} className="animate-spin" />;
    if (text.startsWith("✅"))
      return <CheckCircle2 color="#48BB78" size={20} />;
    if (text.startsWith("⏳"))
      return <Loader2 color="#ECC94B" size={20} className="animate-spin" />;
    return <AlertCircle color="#F56565" size={20} />;
  };

  const colorScheme = status
    ? status.startsWith("✅")
      ? "green"
      : status.startsWith("⏳")
      ? "yellow"
      : "red"
    : "gray";

  return (
    <Box
      bg={bg}
      borderRadius="xl"
      border="1px solid"
      borderColor={borderColor}
      p={6}
      shadow="md"
      transition="all 0.2s ease-in-out"
      _hover={{ transform: "scale(1.01)", boxShadow: "lg" }}
    >
      <HStack mb={3} spacing={3}>
        <Download color="#63B3ED" size={22} />
        <Heading size="md" color={textColor}>
          Diagnóstico TR-069
        </Heading>
      </HStack>

      <Divider borderColor="gray.700" mb={4} />

      <VStack align="start" spacing={3}>
        <Text fontSize="sm" color="gray.400">
          Status do comando <b>DownloadDiagnostics</b>:
        </Text>

        <HStack spacing={3}>
          {renderIcon(status)}
          {status ? (
            <Badge
              px={3}
              py={1}
              colorScheme={colorScheme}
              fontSize="sm"
              borderRadius="md"
            >
              {status}
            </Badge>
          ) : (
            <Spinner size="sm" color="white" />
          )}
        </HStack>
      </VStack>
    </Box>
  );
}
