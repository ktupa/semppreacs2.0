// src/components/PainelProvisionamentos.tsx
import { useEffect, useState } from "react";
import {
  Box,
  Text,
  Spinner,
  SimpleGrid,
  Badge,
  VStack,
  HStack,
  Code,
  Tooltip,
} from "@chakra-ui/react";
import { Settings2, Layers, Info } from "lucide-react";
import { getPresets } from "../services/genieAcsApi";

interface Preset {
  _id: string;
  weight: number;
  precondition: string;
  configurations: any[];
}

export default function PainelProvisionamentos() {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getPresets<Preset>()
      .then((res) => setPresets(res || []))
      .catch(() => setPresets([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading)
    return (
      <Box textAlign="center" p={10}>
        <Spinner size="lg" color="white" />
      </Box>
    );

  if (presets.length === 0)
    return (
      <Box textAlign="center" p={6} color="gray.400">
        Nenhum provisionamento ativo encontrado.
      </Box>
    );

  return (
    <Box>
      <HStack mb={4} spacing={3}>
        <Settings2 color="#63B3ED" />
        <Text fontSize="lg" fontWeight="bold" color="white">
          Provisionamentos Ativos
        </Text>
      </HStack>

      <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={4}>
        {presets.map((p) => (
          <Box
            key={p._id}
            bg="gray.800"
            p={5}
            borderRadius="lg"
            shadow="md"
            border="1px solid"
            borderColor="gray.700"
            transition="all 0.2s ease"
            _hover={{ transform: "scale(1.02)", boxShadow: "lg" }}
          >
            <VStack align="start" spacing={2}>
              <HStack justify="space-between" w="full">
                <HStack>
                  <Layers size={18} color="#90CDF4" />
                  <Text fontWeight="bold" color="white">
                    {p._id}
                  </Text>
                </HStack>
                <Badge colorScheme="purple">Peso: {p.weight}</Badge>
              </HStack>

              <Tooltip label="Precondição de execução" hasArrow>
                <HStack>
                  <Info size={14} color="#F6E05E" />
                  <Code colorScheme="yellow" fontSize="sm">
                    {p.precondition || "Nenhuma"}
                  </Code>
                </HStack>
              </Tooltip>

              <Text fontSize="sm" color="gray.300">
                Configurações aplicadas:{" "}
                <Badge colorScheme="blue">{p.configurations.length}</Badge>
              </Text>
            </VStack>
          </Box>
        ))}
      </SimpleGrid>
    </Box>
  );
}
