// src/components/ResetsSemana.tsx
import { useEffect, useState } from "react";
import {
  Box,
  Text,
  Spinner,
  Center,
  useColorModeValue,
} from "@chakra-ui/react";
import {
  BarChart,
  Bar,
  XAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { getTasks } from "../services/genieAcsApi";

interface ResetData {
  dia: string;
  resets: number;
}

const diasSemana = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export default function ResetsSemana() {
  const [data, setData] = useState<ResetData[]>([]);
  const [loading, setLoading] = useState(true);
  const barColor = useColorModeValue("#3182CE", "#63B3ED");

  useEffect(() => {
    async function carregar() {
      try {
        const seteDiasAtras = new Date();
        seteDiasAtras.setDate(seteDiasAtras.getDate() - 6);
        const isoInicio = seteDiasAtras.toISOString();

        const tasks = await getTasks({
          name: "reboot",
          timestamp: { $gte: isoInicio },
        });

        const contagem: Record<string, number> = {};

        tasks.forEach((task: any) => {
          const dia = new Date(task.timestamp).getDay();
          const label = diasSemana[dia];
          contagem[label] = (contagem[label] || 0) + 1;
        });

        const dadosFormatados: ResetData[] = diasSemana.map((dia) => ({
          dia,
          resets: contagem[dia] || 0,
        }));

        setData(dadosFormatados);
      } catch (err) {
        console.error("Erro ao buscar reboots:", err);
        setData([]);
      } finally {
        setLoading(false);
      }
    }

    carregar();
  }, []);

  return (
    <Box bg="gray.800" p={5} borderRadius="lg" border="1px solid" borderColor="gray.700">
      <Text fontSize="lg" fontWeight="bold" color="white" mb={3}>
        🔁 Resets nos Últimos 7 Dias
      </Text>

      {loading ? (
        <Center py={10}>
          <Spinner color="blue.400" />
        </Center>
      ) : data.every((d) => d.resets === 0) ? (
        <Center h="150px">
          <Text color="gray.400" fontSize="sm">
            Nenhum reset registrado nos últimos 7 dias.
          </Text>
        </Center>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2D3748" />
            <XAxis dataKey="dia" stroke="#CBD5E0" />
            <Tooltip
              contentStyle={{
                backgroundColor: "#1A202C",
                border: "1px solid #2D3748",
                borderRadius: "8px",
                color: "white",
              }}
            />
            <Bar dataKey="resets" fill={barColor} radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </Box>
  );
}
