// src/components/AnaliseConectividade.tsx
import {
  Box,
  Text,
  Badge,
  VStack,
  SimpleGrid,
  Button,
  useDisclosure,
  useColorModeValue,
  HStack,
  Tooltip,
} from "@chakra-ui/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { getDevices, pingCustom } from "../services/genieAcsApi";
import Chart from "react-apexcharts";
import DiagnosticoModal from "./DiagnosticoModal";

interface CPE {
  _id: string;
  _tags?: string[];
  _deviceId: {
    _Manufacturer: string;
    _ProductClass: string;
    _SerialNumber: string;
  };
  _lastInform?: string;
  InternetGatewayDevice?: any;
}

interface PingPoint { time: string; value: number; }
interface PingSerie {
  id: string;
  label: string;
  ip: string;
  lastInform?: string;
  history: PingPoint[];
  problemas: string[];
  fails: number;           // falhas consecutivas
  lastLatency?: number;    // último valor lido (ms)
}

const MAX_HISTORY = 24;           // ~ultimo 24 pontos
const INTERVAL_MS = 8000;         // 8s entre coletas
const WARN_LAT = 60;              // amarelo
const HIGH_LAT = 120;             // vermelho
const REBOOT_WINDOW_MS = 60 * 60 * 1000; // 1h

export default function AnaliseConectividade() {
  const [seriesList, setSeriesList] = useState<PingSerie[]>([]);
  const [selected, setSelected] = useState<PingSerie | null>(null);
  const intervalRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const bgCard = useColorModeValue("#1A202C", "#1A202C");

  // opções do chart memoizadas (estilo único, só variam os dados)
  const baseChartOptions = useMemo<ApexCharts.ApexOptions>(() => ({
    chart: { animations: { enabled: true }, toolbar: { show: false }, foreColor: "#CBD5E0" },
    stroke: { curve: "smooth", width: 2 },
    xaxis: { title: { text: "Horário" }, labels: { style: { colors: "#CBD5E0" } } },
    tooltip: { y: { formatter: (v: number) => `${v} ms` } },
    yaxis: { title: { text: "Ping (ms)" }, labels: { style: { colors: "#CBD5E0" } }, min: 0 },
    grid: { borderColor: "#2D3748" },
  }), []);

  // 1) carregar top CPEs (até 5) com IP e label
  useEffect(() => {
    let mounted = true;
    (async () => {
      const dispositivos: CPE[] = await getDevices();
      if (!mounted) return;

      const topCpes = dispositivos.slice(0, 5);
      const lista: PingSerie[] = topCpes
        .map((cpe) => {
          const ip =
            cpe?.InternetGatewayDevice?.WANDevice?.["1"]
              ?.WANConnectionDevice?.["1"]?.WANPPPConnection?.["1"]
              ?.ExternalIPAddress?._value;

          const login =
            cpe?.InternetGatewayDevice?.WANDevice?.["1"]
              ?.WANConnectionDevice?.["1"]?.WANPPPConnection?.["1"]
              ?.Username?._value;

          const tag = cpe?._tags?.[0];
          const label =
            tag ||
            login ||
            cpe._deviceId._SerialNumber ||
            `${cpe._deviceId._Manufacturer}-${cpe._deviceId._ProductClass}`;

          return {
            id: cpe._id,
            ip,
            lastInform: cpe._lastInform,
            label,
            history: [],
            problemas: [],
            fails: 0,
          } as PingSerie;
        })
        .filter((cpe) => Boolean(cpe.ip));

      setSeriesList(lista);
    })();

    return () => { mounted = false; };
  }, []);

  // 2) loop de coleta – batch update + abort/cleanup + debounce de erro
  useEffect(() => {
    if (!seriesList.length) return;

    const tick = async () => {
      // abortar rodada anterior, se houver
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const nowLabel = new Date().toLocaleTimeString();

      // roda todos os pings em paralelo e só depois atualiza o estado 1x
      const results = await Promise.all(
        seriesList.map(async (cpe) => {
          try {
            const res = await pingCustom(cpe.ip);
            // regex mais ampla (time=10.2 OU time<1 ms)
            const match = String(res?.stdout ?? "").match(/time[=<]\s*(\d+(?:\.\d+)?)/i);
            const latency = match ? parseFloat(match[1]) : NaN;

            const problemas: string[] = [];
            if (!isNaN(latency)) {
              if (latency >= HIGH_LAT) problemas.push("Latência Alta");
              else if (latency >= WARN_LAT) problemas.push("Latência Elevada");
            }

            if (cpe.lastInform) {
              const last = new Date(cpe.lastInform).getTime();
              if (Date.now() - last < REBOOT_WINDOW_MS) problemas.push("Reboot recente");
            }

            return {
              id: cpe.id,
              ok: true,
              latency: isNaN(latency) ? 0 : latency,
              problemas,
              time: nowLabel,
            };
          } catch {
            return {
              id: cpe.id,
              ok: false,
              latency: 0,
              problemas: ["Sem resposta"],
              time: nowLabel,
            };
          }
        })
      );

      setSeriesList((prev) =>
        prev.map((item) => {
          const r = results.find((x) => x.id === item.id);
          if (!r) return item;

          // debounce de erro: só marca "Sem resposta" após 2 falhas seguidas
          const fails = r.ok ? 0 : item.fails + 1;
          const erroDebounced = !r.ok && fails < 2 ? [] : r.problemas;

          const novoPonto: PingPoint = { time: r.time, value: r.latency };
          const history = [...item.history.slice(-MAX_HISTORY + 1), novoPonto];

          // cor primária por status
          let cor = "#00B5D8";
          if (erroDebounced.length) cor = "#FC8181";
          else if (r.latency >= HIGH_LAT) cor = "#FC8181";
          else if (r.latency >= WARN_LAT) cor = "#F6E05E";

          return {
            ...item,
            history,
            problemas: erroDebounced.length ? erroDebounced : r.problemas,
            fails,
            lastLatency: r.latency,
            // guardo cor no próprio item para evitar recomputar no render
            // @ts-ignore
            _color: cor,
          };
        })
      );
    };

    // primeira rodada imediata
    tick();
    // agenda próximas
    intervalRef.current = window.setInterval(tick, INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      abortRef.current?.abort();
    };
  }, [seriesList.length]);

  const abrirDiagnostico = (serie: PingSerie) => {
    setSelected(serie);
    onOpen();
  };

  return (
    <Box>
      <Text fontSize="lg" fontWeight="bold" mb={4} color="white">
        📡 Análise Inteligente de Conectividade
      </Text>

      <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
        {seriesList.map((serie) => {
          // cor calculada no loop (fallback azul)
          // @ts-ignore
          const lineColor: string = serie?._color || "#00B5D8";

          const lastMinAgo = serie.lastInform
            ? Math.floor((Date.now() - new Date(serie.lastInform).getTime()) / 60000)
            : undefined;

          const statusBadge =
            serie.problemas[0] ||
            (typeof serie.lastLatency === "number" ? `${serie.lastLatency} ms` : "—");

          return (
            <Box key={serie.id} bg={bgCard} borderRadius="xl" p={4} shadow="md">
              <VStack align="start" spacing={2} w="100%">
                <HStack>
                  <Badge colorScheme={/Sem resposta/i.test(statusBadge) ? "red"
                    : /Alta|Elevada/.test(statusBadge) ? "orange"
                    : "green"}>
                    {statusBadge}
                  </Badge>
                  {typeof lastMinAgo === "number" && (
                    <Tooltip label="Minutos desde o último Inform">
                      <Badge variant="outline" colorScheme={lastMinAgo <= 5 ? "green" : "purple"}>
                        {lastMinAgo} min
                      </Badge>
                    </Tooltip>
                  )}
                </HStack>

                <Text fontSize="sm" color="gray.300" noOfLines={1}>
                  {serie.label}
                </Text>
                <Text fontSize="xs" color="gray.400">IP: {serie.ip}</Text>

                <Button
                  size="sm"
                  colorScheme="teal"
                  variant="outline"
                  onClick={() => abrirDiagnostico(serie)}
                >
                  Diagnosticar
                </Button>

                <Chart
                  type="line"
                  height={200}
                  options={{
                    ...baseChartOptions,
                    colors: [lineColor],
                    xaxis: {
                      ...baseChartOptions.xaxis,
                      categories: serie.history.map((p) => p.time),
                    },
                  }}
                  series={[
                    {
                      name: "Ping (ms)",
                      data: serie.history.map((p) => p.value),
                    },
                  ]}
                />
              </VStack>
            </Box>
          );
        })}
      </SimpleGrid>

      <DiagnosticoModal isOpen={isOpen} onClose={onClose} cpe={selected} />
    </Box>
  );
}
