
import { Box, Heading, VStack, Text, Badge, Spinner } from "@chakra-ui/react";

interface Props {
  status: string | null;
}

export default function DiagnosticoTR069({ status }: Props) {
  return (
    <Box bg="gray.800" p={4} borderRadius="md">
      <Heading size="sm" mb={2}>⚙️ Diagnóstico TR-069</Heading>
      <VStack align="start" spacing={2}>
        <Text fontSize="sm">Comando DownloadDiagnostics:</Text>
        {status ? (
          <Badge colorScheme={status.startsWith("✅") ? "green" : "red"}>
            {status}
          </Badge>
        ) : (
          <Spinner size="sm" />
        )}
      </VStack>
    </Box>
  );
}
