import { useEffect, useRef, useState } from "react";
import { Box, HStack, Text, Badge, Select, useToast } from "@chakra-ui/react";
import Chart from "react-apexcharts";
import type { ApexOptions } from "apexcharts";
import { pingCustom as apiPingHost } from "../services/genieAcsApi";

interface Props {
  host?: string;              // IP/host a pingar (WAN ou destino)
  fallbackHosts?: string[];   // ex: ["8.8.8.8","1.1.1.1"]
  intervalMs?: number;        // 3-5s
  title?: string;
}

export default function PingChart({ host, fallbackHosts = ["8.8.8.8"], intervalMs = 5000, title="Ping (ms)" }: Props) {
  const [data, setData] = useState<number[]>([]);
  const [labels, setLabels] = useState<string[]>([]);
  const [target, setTarget] = useState<string>(host || fallbackHosts[0] || "");
  const timer = useRef<number | null>(null);
  const toast = useToast();

  const pingOnce = async () => {
    try {
      const res = await (apiPingHost ? apiPingHost(target) : fetch(`/ping/${encodeURIComponent(target)}`).then(r=>r.json()));
      // Aceita diferentes formatos: {avg}, {latency}, {stdout}
      let v = Number(res?.avg ?? res?.latency);
      if (!Number.isFinite(v)) {
        // tenta parser do stdout
        const m = String(res?.stdout||"").match(/time[=<]([\d.]+)/i);
        v = m ? Number(m[1]) : NaN;
      }
      const val = Number.isFinite(v) ? Math.max(0, Math.round(v)) : null;
      const now = new Date().toLocaleTimeString();
      setData(prev => [...prev.slice(-29), (val ?? null) as any]);
      setLabels(prev => [...prev.slice(-29), now]);
    } catch (e:any) {
      toast({status:"warning", title:"Ping falhou", description: e?.message, duration:2000});
      setData(prev => [...prev.slice(-29), null as any]);
      setLabels(prev => [...prev.slice(-29), new Date().toLocaleTimeString()]);
    }
  };

  useEffect(() => {
    setData([]); setLabels([]);
    if (timer.current) clearInterval(timer.current);
    pingOnce();
    timer.current = window.setInterval(pingOnce, intervalMs) as unknown as number;
    return () => { if (timer.current) clearInterval(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const options: ApexOptions = {
    chart: { type: "line", animations: { enabled:false }, toolbar: { show:false }, sparkline:{ enabled:false }},
    stroke: { curve:"smooth", width: 3 },
    xaxis: { categories: labels, labels: { show: true } },
    yaxis: { min: 0, decimalsInFloat: 0, labels: { formatter: (v)=>`${v} ms` } },
    tooltip: { y: { formatter: (v)=> Number.isFinite(v)? `${v} ms` : "—" } }
  };

  return (
    <Box bg="gray.800" p={4} borderRadius="lg" border="1px solid" borderColor="gray.700">
      <HStack mb={3} justify="space-between">
        <HStack>
          <Text fontWeight="bold" color="white">{title}</Text>
          <Badge colorScheme="purple">{target}</Badge>
        </HStack>
        <Select size="sm" maxW="220px" value={target}
          onChange={(e)=> setTarget(e.target.value)}>
          {[target, ...fallbackHosts].filter((v,i,a)=>v && a.indexOf(v)===i).map(h => <option key={h} value={h}>{h}</option>)}
        </Select>
      </HStack>
      <Chart type="line" height={220} options={options} series={[{ name:"Ping", data: data as any }]} />
    </Box>
  );
}
