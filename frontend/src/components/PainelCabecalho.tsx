// src/components/PainelCabecalho.tsx
import {
  Box,
  Heading,
  SimpleGrid,
  Stat,
  StatLabel,
  StatNumber,
  Badge,
  HStack,
  Tooltip,
  IconButton,
  Text,
  useToast,
} from "@chakra-ui/react";
import { Copy, Server, Activity, Cpu, RefreshCcw } from "lucide-react";

interface Props {
  login: string;
  ip: string;
  online: boolean;
  fabricante: string;
  modelo: string;
  firmware: string;
  lastInform?: string; // opcional
}

export default function PainelCabecalho({
  login,
  ip,
  online,
  fabricante,
  modelo,
  firmware,
  lastInform,
}: Props) {
  const toast = useToast();

  const copyIP = async () => {
    try {
      await navigator.clipboard.writeText(ip || "");
      toast({ status: "success", title: "IP copiado!" });
    } catch {
      toast({ status: "error", title: "Não foi possível copiar o IP." });
    }
  };

  const lastSeen = lastInform
    ? new Date(lastInform).toLocaleString()
    : null;

  return (
    <Box mb={6}>
      <HStack justify="space-between" mb={4}>
        <Heading size="lg" color="white">
          Dispositivo: {login || "-"}
        </Heading>
        {lastSeen && (
          <HStack spacing={2}>
            <Text fontSize="sm" color="gray.400">
              Último inform:
            </Text>
            <Badge colorScheme="purple">{lastSeen}</Badge>
          </HStack>
        )}
      </HStack>

      <SimpleGrid columns={{ base: 1, md: 3, lg: 5 }} spacing={4}>
        <Stat bg="gray.800" p={4} borderRadius="md">
          <StatLabel color="gray.400">
            <HStack spacing={2}>
              <Server size={16} />
              <span>IP</span>
            </HStack>
          </StatLabel>
          <HStack justify="space-between">
            <StatNumber color="white" fontSize="xl">
              {ip || "-"}
            </StatNumber>
            <Tooltip label="Copiar IP">
              <IconButton
                aria-label="copiar-ip"
                size="sm"
                variant="outline"
                colorScheme="blue"
                onClick={copyIP}
                icon={<Copy size={16} />}
              />
            </Tooltip>
          </HStack>
        </Stat>

        <Stat bg="gray.800" p={4} borderRadius="md">
          <StatLabel color="gray.400">
            <HStack spacing={2}>
              <Activity size={16} />
              <span>Status</span>
            </HStack>
          </StatLabel>
          <HStack>
            <Badge
              colorScheme={online ? "green" : "red"}
              variant="solid"
              px={3}
              py={1}
              borderRadius="md"
            >
              <span
                style={{
                  display: "inline-block",
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: online ? "#48BB78" : "#F56565",
                  marginRight: 6,
                }}
              />
              {online ? "Online" : "Offline"}
            </Badge>
          </HStack>
        </Stat>

        <Stat bg="gray.800" p={4} borderRadius="md">
          <StatLabel color="gray.400">
            <HStack spacing={2}>
              <Cpu size={16} />
              <span>Fabricante</span>
            </HStack>
          </StatLabel>
          <StatNumber color="white" fontSize="xl">
            {fabricante || "-"}
          </StatNumber>
        </Stat>

        <Stat bg="gray.800" p={4} borderRadius="md">
          <StatLabel color="gray.400">Modelo</StatLabel>
          <StatNumber color="white" fontSize="xl">
            {modelo || "-"}
          </StatNumber>
        </Stat>

        <Stat bg="gray.800" p={4} borderRadius="md">
          <StatLabel color="gray.400">
            <HStack spacing={2}>
              <RefreshCcw size={16} />
              <span>Firmware</span>
            </HStack>
          </StatLabel>
          <StatNumber color="white" fontSize="lg">
            {firmware || "-"}
          </StatNumber>
        </Stat>
      </SimpleGrid>
    </Box>
  );
}
