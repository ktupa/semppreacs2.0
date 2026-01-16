// src/components/DiagnosticoModal.tsx
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody,
  Text,
  Spinner,
  VStack,
  Code,
  Badge,
  HStack,
  Box,
  Divider,
  useColorModeValue,
} from "@chakra-ui/react";
import { useEffect, useState } from "react";
import {
  pingCustom,
  traceroute,
  speedTest,
  enviarDownloadDiagnostics,
} from "../services/genieAcsApi";
import {
  Download,
  SignalHigh,
  Route,
  Gauge,
} from "lucide-react";
import axios from "axios";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  cpe: {
    ip: string;
    label: string;
    id: string;
  } | null;
}

export default function DiagnosticoModal({ isOpen, onClose, cpe }: Props) {
  const [pingResult, setPingResult] = useState<string | null>(null);
  const [traceResult, setTraceResult] = useState<string | null>(null);
  const [speedResult, setSpeedResult] = useState<string | null>(null);
  const [downloadStatus, setDownloadStatus] = useState<string | null>(null);
  const bgBox = useColorModeValue("gray.700", "gray.700");
  const textColor = useColorModeValue("white", "whiteAlpha.900");

  useEffect(() => {
    if (!isOpen || !cpe) return;

    const rodarDiagnostico = async () => {
      setPingResult(null);
      setTraceResult(null);
      setSpeedResult(null);
      setDownloadStatus("⏳ Enviando comando TR-069...");

      try {
        await enviarDownloadDiagnostics(cpe.id);
        setDownloadStatus("✅ Comando enviado com sucesso!");
      } catch (err) {
        if (axios.isAxiosError(err) && err.response?.data?.detail) {
          setDownloadStatus(`❌ ${err.response.data.detail}`);
        } else {
          setDownloadStatus("❌ Erro desconhecido ao enviar diagnóstico.");
        }
      }

      try {
        const ping = await pingCustom(cpe.ip);
        setPingResult(ping.stdout || "Sem resposta");
      } catch {
        setPingResult("❌ Erro ao executar ping.");
      }

      try {
        const trace = await traceroute(cpe.ip);
        setTraceResult(trace.stdout || "Sem resposta");
      } catch {
        setTraceResult("❌ Erro ao executar traceroute.");
      }

      try {
        const speed = await speedTest(cpe.ip);
        setSpeedResult(`${(speed as any).speed_mbps || speed.download_mbps || "?"} Mbps`);
      } catch {
        setSpeedResult("❌ Erro no speedtest.");
      }
    };

    rodarDiagnostico();
  }, [isOpen, cpe]);

  const renderStatus = (status: string | null) => {
    if (!status) return <Spinner />;
    if (status.startsWith("✅"))
      return <Badge colorScheme="green">{status}</Badge>;
    if (status.startsWith("❌"))
      return <Badge colorScheme="red">{status}</Badge>;
    return <Badge colorScheme="yellow">{status}</Badge>;
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="2xl"
      isCentered
      scrollBehavior="inside"
    >
      <ModalOverlay />
      <ModalContent bg="gray.800" color={textColor}>
        <ModalHeader>Diagnóstico — {cpe?.label}</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack align="stretch" spacing={4}>
            <Text fontSize="sm" color="gray.300">
              IP: <b>{cpe?.ip}</b>
            </Text>

            <Divider borderColor="gray.600" />

            {/* DOWNLOAD DIAGNOSTICS */}
            <HStack>
              <Download size={18} />
              <Text fontWeight="bold">DownloadDiagnostics (TR-069)</Text>
            </HStack>
            <Box bg={bgBox} p={2} borderRadius="md">
              {renderStatus(downloadStatus)}
            </Box>

            {/* PING */}
            <HStack>
              <SignalHigh size={18} />
              <Text fontWeight="bold">Ping</Text>
            </HStack>
            <Box bg={bgBox} p={2} borderRadius="md">
              {pingResult ? (
                <Code
                  whiteSpace="pre-wrap"
                  w="full"
                  bg="transparent"
                  fontSize="sm"
                >
                  {pingResult}
                </Code>
              ) : (
                <Spinner />
              )}
            </Box>

            {/* TRACEROUTE */}
            <HStack>
              <Route size={18} />
              <Text fontWeight="bold">Traceroute</Text>
            </HStack>
            <Box bg={bgBox} p={2} borderRadius="md">
              {traceResult ? (
                <Code
                  whiteSpace="pre-wrap"
                  w="full"
                  bg="transparent"
                  fontSize="sm"
                >
                  {traceResult}
                </Code>
              ) : (
                <Spinner />
              )}
            </Box>

            {/* SPEEDTEST */}
            <HStack>
              <Gauge size={18} />
              <Text fontWeight="bold">Speedtest</Text>
            </HStack>
            <Box bg={bgBox} p={2} borderRadius="md">
              {speedResult ? (
                <Badge
                  colorScheme={speedResult.includes("❌") ? "red" : "blue"}
                  fontSize="lg"
                >
                  {speedResult}
                </Badge>
              ) : (
                <Spinner />
              )}
            </Box>
          </VStack>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
