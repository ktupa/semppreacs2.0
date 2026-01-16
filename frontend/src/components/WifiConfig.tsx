// src/components/WifiConfig.tsx
// Ultra Premium Wi-Fi (TR-098/TR-181 + TP-Link/Huawei mappings) – layout fixo, branco total e UX top

import {
  Box, Text, Badge, HStack, VStack, Grid, GridItem,
  FormControl, FormLabel, Select, Input, Switch, Checkbox,
  Slider, SliderTrack, SliderFilledTrack, SliderThumb,
  Tabs, TabList, TabPanels, Tab, TabPanel,
  Button, IconButton, Tooltip, useToast, Tag, TagLabel,
  Table, Thead, Tbody, Tr, Th, Td, Code, Spacer, SimpleGrid, Divider
} from "@chakra-ui/react";
import { useEffect, useRef, useState } from "react";
import { ViewIcon, ViewOffIcon, RepeatIcon } from "@chakra-ui/icons";
import Chart from "react-apexcharts";
import type { ApexOptions } from "apexcharts";
import { setParameterValues, createTask } from "../services/genieAcsApi";

// ============ Constantes & Tipos ============
const RADIOS = [
  { idx: 1, label: "2.4GHz", banda: "2.4GHz" as const },
  { idx: 2, label: "5GHz", banda: "5GHz" as const },
];
type Banda = "2.4GHz" | "5GHz";
type Cliente = { mac: string; host?: string; rssi?: number; band?: Banda };

type SecurityMode = "open" | "wpa2" | "wpa3" | "mixed" | "owe";
type WifiState = {
  enabled: boolean; ssid: string; senha: string; mostrarSenha: boolean;
  security: SecurityMode; crypto: "AES" | "TKIP" | "Auto";
  autoChannel: boolean; channel: string; bandwidth: string; mode: string;
  invisible: boolean; wmm: boolean; txPower: number;
  shortGi: boolean; apIsolation: boolean; beacon: number; rts: number; dtim: number;
  groupKeyInterval: number; wds: boolean;
  wpsEnable: boolean; wpsPin?: string;
  multi: Array<{ enable: boolean; ssid: string; hide: boolean; security: "open"|"mixed"; }>;
  scheduleEnable: boolean; schedule?: Array<{ id: string; start: string; end: string; repeat: string }>;
  recommended?: number | null; clientes: Cliente[];
};
type RSSIPonto = { t: string; v: number | null };
type RSSIHistory = Record<string, RSSIPonto[]>;
interface WifiConfigProps { device: any; onApplied?: () => void }

// ============ Helpers ============
const first = (arr: (string|undefined|null)[]) => arr.find(Boolean) ?? undefined;
const get = (o: any, path: string | undefined, fb?: any): any => {
  if (!path) return fb;
  try {
    const v = path.split(".").reduce((acc: any, k: string) => acc?.[k], o);
    if (v === undefined || v === null) return fb;
    if (typeof v === 'object' && '_value' in v) return v._value ?? fb;
    if (typeof v === 'object') return v;
    return v ?? fb;
  } catch {
    return fb;
  }
};
const num = (v: any, fb=0) => { const n = parseInt(String(v),10); return Number.isFinite(n)?n:fb; };

const PATHS = (radio: number) => ({
  ENABLE: first([
    `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${radio}.Enable`,
    `Device.WiFi.SSID.${radio}.Enable`,
  ]),
  SSID: first([
    `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${radio}.SSID`,
    `Device.WiFi.SSID.${radio}.SSID`
  ]),
  PASS: first([
    `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${radio}.X_TP_PreSharedKey`,
    `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${radio}.PreSharedKey`,
    `Device.WiFi.AccessPoint.${radio}.Security.KeyPassphrase`,
  ]),
  SECURITY: first([
    `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${radio}.X_TP_SecurityMode`,
    `Device.WiFi.AccessPoint.${radio}.Security.ModeEnabled`
  ]),
  CRYPTO: first([
    `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${radio}.X_TP_Encryption`,
    `Device.WiFi.AccessPoint.${radio}.Security.EncryptionMode`
  ]),
  INVISIBLE: first([
    `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${radio}.SSIDAdvertisementEnabled`, // true = exibe
  ]),
  WMM: first([
    `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${radio}.WMMEnable`,
    `Device.WiFi.AccessPoint.${radio}.WMMEnable`
  ]),
  MODE: first([
    `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${radio}.Standard`,
    `Device.WiFi.Radio.${radio}.OperatingStandards`
  ]),
  AUTOCHAN: first([
    `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${radio}.AutoChannelEnable`,
    `Device.WiFi.Radio.${radio}.AutoChannelEnable`
  ]),
  CHANNEL: first([
    `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${radio}.Channel`,
    `Device.WiFi.Radio.${radio}.Channel`
  ]),
  BANDWIDTH: first([
    `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${radio}.X_TP_Bandwidth`,
    `Device.WiFi.Radio.${radio}.OperatingChannelBandwidth`
  ]),
  TXPOWER: first([
    `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${radio}.X_TP_TransmitPower`,
    `Device.WiFi.Radio.${radio}.TransmitPower`
  ]),
  SHORT_GI: `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${radio}.X_TP_ShortGI`,
  AP_ISO: first([
    `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${radio}.IsolationEnable`,
    `Device.WiFi.AccessPoint.${radio}.IsolationEnable`
  ]),
  BEACON: `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${radio}.BeaconInterval`,
  RTS: `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${radio}.RTSThreshold`,
  DTIM: `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${radio}.DTIMInterval`,
  GTKUPDATE: `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${radio}.RekeyingInterval`,
  WDS: `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${radio}.WDSBridgeEnable`,
  WPS_EN: first([
    `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${radio}.WPS.Enable`,
    `Device.WiFi.AccessPoint.${radio}.WPS.Enable`
  ]),
  WPS_PBC: first([
    `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${radio}.WPS.X_TP_DoSimpleConfig`,
  ]),
  WPS_PIN: first([
    `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${radio}.WPS.X_TP_STAEnrolleePIN`,
  ]),
  ASSOC_TR098: `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${radio}.AssociatedDevice`,
  ASSOC_TR181: `Device.WiFi.AccessPoint.${radio}.AssociatedDevice`,
  DISASSOC_TP: `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${radio}.X_TP_DisassociateStation`,
  ACL_ENABLE: `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${radio}.MACAddressControlEnabled`,
  ACL_POLICY: `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${radio}.MACAddressControlPolicy`,
  ACL_LIST: `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${radio}.MACAddressControlList`,
});

function rssiBadge(rssi?: number) {
  if (rssi === undefined || !Number.isFinite(rssi)) return <Badge colorScheme="gray">—</Badge>;
  const color =
    rssi >= -55 ? "green" :
    rssi >= -67 ? "teal"  :
    rssi >= -75 ? "yellow": rssi >= -85 ? "orange" : "red";
  const label =
    rssi >= -55 ? "Excelente" :
    rssi >= -67 ? "Bom"       :
    rssi >= -75 ? "Médio"     :
    rssi >= -85 ? "Ruim"      : "Muito ruim";
  return <Badge colorScheme={color}>{label} ({rssi} dBm)</Badge>;
}

function scoreCanais(vizinhos: { canal: number; rssi: number; banda: Banda }[], banda: Banda) {
  const pool = banda === "2.4GHz" ? [1,6,11] : [36,40,44,48,52,56,60,64,100,104,108,112,149,153,157,161];
  const scores: Record<number, number> = {}; pool.forEach(ch => scores[ch]=0);
  vizinhos.filter(v=>v.banda===banda).forEach(v=>{
    if(scores[v.canal]!==undefined){
      const peso = 100 + (Number.isFinite(v.rssi) ? v.rssi : -100);
      scores[v.canal]+=Math.max(1,peso);
    }
  });
  let best=pool[0], val=Infinity; for (const ch of pool){ if(scores[ch] < val){ val=scores[ch]; best=ch; } }
  return { best, scores };
}

// ============ Componente principal ============
export default function WifiConfig({ device, onApplied }: WifiConfigProps) {
  const toast = useToast();
  const [wifi, setWifi] = useState<Record<number, WifiState>>({});
  const [scan, setScan] = useState<{ ssid: string; canal: number; rssi: number; banda: Banda }[]>([]);
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<RSSIHistory>({});
  const intervalRef = useRef<number | null>(null);

  // ---------- Carrega estado a partir do device ----------
  useEffect(() => {
    if (!device) return;

    // Scan (quando existir em TR-181)
    const sr = Array.isArray(device?.Device?.WiFi?.ScanResults)
      ? device.Device.WiFi.ScanResults.map((s: any) => {
          const ch = parseInt(s?.Channel?._value ?? "0", 10);
          const rssiParsed = parseInt(s?.RSSI?._value ?? "", 10);
          const rssi = Number.isFinite(rssiParsed) ? rssiParsed : -999;
          const ssid = s?.SSID?._value ?? "—";
          const banda: Banda = ch >= 36 ? "5GHz" : "2.4GHz";
          return { ssid, canal: ch || 0, rssi, banda };
        })
      : [];
    setScan(sr);

    const next: Record<number, WifiState> = {};
    for (const r of RADIOS) {
      const P = PATHS(r.idx);

      const enabled = String(get(device, P.ENABLE, "true")) !== "false";
      const ssid = String(get(device, P.SSID, ""));
      const senha = String(get(device, P.PASS, ""));
      const autoChannel = String(get(device, P.AUTOCHAN, "true")) !== "false";
      const channel = autoChannel ? "Auto" : String(get(device, P.CHANNEL, r.banda === "2.4GHz" ? "6" : "36"));
      const bandwidth = String(get(device, P.BANDWIDTH, r.banda === "2.4GHz" ? "20MHz" : "80MHz"));
      const mode = String(get(device, P.MODE, r.banda === "2.4GHz" ? "802.11b/g/n mixed" : "802.11a/n/ac mixed"));
      const invisible = !(String(get(device, P.INVISIBLE, "true")) === "true"); // true=exibe → nossa flag é "ocultar"
      const wmm = String(get(device, P.WMM, "true")) !== "false";
      const txPower = num(get(device, P.TXPOWER, 100), 100);
      const securityRaw = String(get(device, P.SECURITY, "WPA2-PSK"));
      const cryptoRaw = String(get(device, P.CRYPTO, "AES"));

      const shortGi = String(get(device, P.SHORT_GI, "true")) === "true";
      const apIsolation = String(get(device, P.AP_ISO, "false")) === "true";
      const beacon = num(get(device, P.BEACON, 100), 100);
      const rts = num(get(device, P.RTS, 2347), 2347);
      const dtim = num(get(device, P.DTIM, 1), 1);
      const gtk = num(get(device, P.GTKUPDATE, 0), 0);
      const wds = String(get(device, P.WDS, "false")) === "true";
      const wpsEnable = String(get(device, P.WPS_EN, "true")) === "true";

      next[r.idx] = {
        enabled, ssid, senha, mostrarSenha: false,
        security: /WPA3/i.test(securityRaw) ? "wpa3" : /WPA\/?WPA2|mixed/i.test(securityRaw) ? "mixed" : /WPA2/i.test(securityRaw) ? "wpa2" : "open",
        crypto: /TKIP/i.test(cryptoRaw) ? "TKIP" : /AES/i.test(cryptoRaw) ? "AES" : "Auto",
        autoChannel, channel, bandwidth, mode,
        invisible, wmm, txPower,
        shortGi, apIsolation, beacon, rts, dtim, groupKeyInterval: gtk, wds,
        wpsEnable,
        multi: [0,1,2].map(()=>({ enable:false, ssid:"", hide:false, security:"open" as const })),
        scheduleEnable: false, schedule: [],
        recommended: null, clientes: [],
      };

      // Clientes associados – TR-098
      const assocTR098 = get(device, P.ASSOC_TR098);
      if (assocTR098 && typeof assocTR098 === "object") {
        Object.keys(assocTR098).forEach(k => {
          const node = assocTR098[k];
          const mac = node?.AssociatedDeviceMACAddress?._value || node?.MACAddress?._value;
          const parsed = parseInt(node?.AssociatedDeviceSignalStrength?._value ?? node?.SignalStrength?._value ?? "", 10);
          const rssi = Number.isFinite(parsed) ? parsed : undefined;
          if (mac) next[r.idx].clientes.push({ mac, rssi, band: r.banda });
        });
      }
      // Clientes associados – TR-181
      const assocTR181 = get(device, P.ASSOC_TR181);
      if (assocTR181 && typeof assocTR181 === "object") {
        Object.keys(assocTR181).forEach(k => {
          const node = assocTR181[k];
          const mac = node?.MACAddress?._value;
          const parsed = parseInt(node?.SignalStrength?._value ?? "", 10);
          const rssi = Number.isFinite(parsed) ? parsed : undefined;
          if (mac) next[r.idx].clientes.push({ mac, rssi, band: r.banda });
        });
      }
    }
    setWifi(next);
  }, [device]);

  // ---------- Recalcula sugestão de canal e mantém estado consistente ----------
  useEffect(() => {
    if (!scan.length) {
      setWifi(prev => {
        const c = { ...prev };
        for (const r of RADIOS) {
          const base = c[r.idx] ?? {
            enabled: true, ssid: "", senha: "", mostrarSenha: false,
            security: "mixed" as SecurityMode, crypto: "Auto" as const,
            autoChannel: true, channel: "Auto",
            bandwidth: r.banda === "2.4GHz" ? "20MHz" : "80MHz",
            mode: r.banda === "2.4GHz" ? "802.11b/g/n mixed" : "802.11a/n/ac mixed",
            invisible: false, wmm: true, txPower: 100,
            shortGi: true, apIsolation: false, beacon: 100, rts: 2347, dtim: 1, groupKeyInterval: 0,
            wds: false, wpsEnable: true,
            multi: [0,1,2].map(()=>({ enable:false, ssid:"", hide:false, security:"open" as const })),
            scheduleEnable: false, schedule: [],
            clientes: [],
          } as WifiState;

          c[r.idx] = { ...base, recommended: null, clientes: base.clientes ?? [] };
        }
        return c;
      });
      return;
    }

    setWifi(prev => {
      const c = { ...prev };
      for (const r of RADIOS) {
        const { best } = scoreCanais(scan, r.banda);
        const base = c[r.idx] ?? {} as Partial<WifiState>;
        c[r.idx] = { ...(base as WifiState), recommended: best ?? null, clientes: base.clientes ?? [] };
      }
      return c;
    });
  }, [scan]);

  // ---------- Histórico de RSSI (sparkline) ----------
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);

    intervalRef.current = window.setInterval(() => {
      setHistory(prev => {
        const now = new Date();
        const label = now.toLocaleTimeString();
        const u: RSSIHistory = { ...prev };

        for (const r of RADIOS) {
          const lista = (wifi?.[r.idx]?.clientes ?? []) as Cliente[];
          lista.forEach(c => {
            const key = c.mac;
            const cur = u[key] ?? [];
            const v = Number.isFinite(c?.rssi as number) ? (c.rssi as number) : null; // mantém null → apex ignora
            u[key] = [...cur.slice(-9), { t: label, v }];
          });
        }
        return u;
      });
    }, 10000) as unknown as number;

    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [wifi]);

  // ---------- Ações ----------
  const desconectarCliente = async (radioIdx: number, mac: string) => {
    const P = PATHS(radioIdx);
    const opsVendor = P.DISASSOC_TP ? [{ name: P.DISASSOC_TP, value: mac, type: "xsd:string" }] : [];
    const opsACL = [
      { name: P.ACL_ENABLE!, value: "true", type: "xsd:boolean" },
      { name: P.ACL_POLICY!, value: "Deny", type: "xsd:string" },
      { name: P.ACL_LIST!, value: mac, type: "xsd:string" },
    ];
    try {
      if (opsVendor.length) { await setParameterValues(device._id, opsVendor); toast({ status: "success", title: `Desconectando ${mac}` }); return; }
      throw new Error("no-vendor");
    } catch {
      try {
        const atual = String(get(device, P.ACL_LIST, ""));
        const novo = atual ? `${atual},${mac}` : mac; opsACL[2].value = novo;
        await setParameterValues(device._id, opsACL);
        toast({ status: "success", title: `MAC ${mac} bloqueado (ACL)` });
      } catch { toast({ status: "error", title: `Falha ao desconectar ${mac}` }); }
    }
  };

  const startWpsPbc = async (radioIdx: number) => {
    const P = PATHS(radioIdx); if (!P.WPS_PBC) return toast({status:"warning", title:"WPS PBC indisponível"});
    try { await setParameterValues(device._id, [{ name: P.WPS_PBC, value: "true", type: "xsd:boolean" }]); toast({status:"success", title:"WPS iniciado"}); } 
    catch { toast({status:"error", title:"Falha ao iniciar WPS"}); }
  };

  const salvar = async (reboot = false) => {
    if (!device?._id) return;
    setSaving(true);
    try {
      const params: { name: string; value: string; type: string }[] = [];
      for (const r of RADIOS){
        const st = wifi[r.idx]; if (!st) continue; const P = PATHS(r.idx);
        if (P.ENABLE)  params.push({ name: P.ENABLE, value: st.enabled?"true":"false", type: "xsd:boolean" });
        if (P.SSID)    params.push({ name: P.SSID, value: st.ssid, type: "xsd:string" });
        if (P.INVISIBLE) params.push({ name: P.INVISIBLE, value: st.invisible?"false":"true", type: "xsd:boolean" }); // false = anuncia
        if (P.WMM)     params.push({ name: P.WMM, value: st.wmm?"true":"false", type: "xsd:boolean" });
        if (P.TXPOWER) params.push({ name: P.TXPOWER, value: String(st.txPower), type: "xsd:unsignedInt" });
        if (P.MODE)    params.push({ name: P.MODE, value: st.mode, type: "xsd:string" });
        if (P.BANDWIDTH) params.push({ name: P.BANDWIDTH, value: st.bandwidth, type: "xsd:string" });
        if (P.PASS)    params.push({ name: P.PASS, value: st.senha, type: "xsd:string" });
        if (P.SECURITY) params.push({ name: P.SECURITY, value:
          st.security==="wpa3" ? "WPA3-Personal" :
          st.security==="mixed"? "WPA/WPA2-Personal" :
          st.security==="wpa2" ? "WPA2-PSK":"None", type: "xsd:string" });
        if (P.CRYPTO) params.push({ name: P.CRYPTO, value: st.crypto, type: "xsd:string" });
        if (P.AUTOCHAN) params.push({ name: P.AUTOCHAN, value: st.autoChannel?"true":"false", type: "xsd:boolean" });
        if (!st.autoChannel && P.CHANNEL) params.push({ name: P.CHANNEL, value: st.channel, type: "xsd:unsignedInt" });

        if (P.SHORT_GI) params.push({ name: P.SHORT_GI, value: st.shortGi?"true":"false", type: "xsd:boolean" });
        if (P.AP_ISO) params.push({ name: P.AP_ISO, value: st.apIsolation?"true":"false", type: "xsd:boolean" });
        if (P.BEACON) params.push({ name: P.BEACON, value: String(st.beacon), type: "xsd:unsignedInt" });
        if (P.RTS) params.push({ name: P.RTS, value: String(st.rts), type: "xsd:unsignedInt" });
        if (P.DTIM) params.push({ name: P.DTIM, value: String(st.dtim), type: "xsd:unsignedInt" });
        if (P.GTKUPDATE) params.push({ name: P.GTKUPDATE, value: String(st.groupKeyInterval), type: "xsd:unsignedInt" });
        if (P.WDS) params.push({ name: P.WDS, value: st.wds?"true":"false", type: "xsd:boolean" });

        if (P.WPS_EN) params.push({ name: P.WPS_EN, value: st.wpsEnable?"true":"false", type: "xsd:boolean" });
        if (st.wpsPin && P.WPS_PIN) params.push({ name: P.WPS_PIN, value: st.wpsPin, type: "xsd:string" });
      }

      if (params.length) await setParameterValues(device._id, params);
      if (reboot) await createTask(device._id, { name: "reboot" }, true);
      toast({ status: "success", title: reboot?"Configurações aplicadas e reinício solicitado":"Configurações aplicadas" });
      onApplied?.();
    } catch {
      toast({ status: "error", title: "Falha ao aplicar configurações" });
    } finally {
      setSaving(false);
    }
  };

  // ---------- UI helpers ----------
  const renderSpark = (mac: string) => {
    const serie = history[mac] ?? [];
    // mantemos nulls – Apex ignora e não “puxa” layout
    const values = serie.map(p => p.v === null ? null : p.v);
    const labels = serie.map(p => p.t);
    const options: ApexOptions = {
      chart:{ type:"line", sparkline:{enabled:true}, animations:{enabled:false} },
      stroke:{ curve:"smooth", width:2 },
      tooltip:{ y:{ formatter:(v)=> (v === null ? "—" : `${v} dBm`) } }
    };
    return <Chart type="line" height={40} options={{...options, xaxis:{ categories: labels }}} series={[{ name:"RSSI", data: values }]} />;
  };

  const bandChannels = (b: Banda) => b === "2.4GHz"
    ? ["20MHz","40MHz","20/40MHz","Auto"]
    : ["20MHz","40MHz","80MHz","160MHz","Auto"];
  const channelPool = (b: Banda) => b === "2.4GHz"
    ? ["Auto","1","2","3","4","5","6","7","8","9","10","11","12","13"]
    : ["Auto","36","40","44","48","52","56","60","64","100","104","108","112","149","153","157","161"];

  const header = (
    <VStack w="full" spacing={3} mb={3}>
      <HStack w="full" px={1}>
        <Text fontSize="xl" fontWeight="bold" color="white">Configurações Wi-Fi</Text>
        <Spacer />
        <HStack>
          <Tooltip label="Atualizar varredura (quando suportado pela CPE)">
            <IconButton aria-label="reload" icon={<RepeatIcon/>} size="sm" onClick={()=> setScan(prev=>[...prev])} />
          </Tooltip>
          <Button colorScheme="green" isLoading={saving} onClick={()=>salvar(false)}>Aplicar</Button>
          <Button colorScheme="orange" isLoading={saving} onClick={()=>salvar(true)}>Aplicar + Reboot</Button>
        </HStack>
      </HStack>
    </VStack>
  );

  const BasicCard = (r:{idx:number;banda:Banda}) => {
    const st = wifi[r.idx]; if (!st) return null;
    return (
      <VStack align="stretch" spacing={4} bg="gray.900" p={4} borderRadius="md" border="1px solid" borderColor="whiteAlpha.200">
        <SimpleGrid columns={{base:1, md:2}} spacing={4}>
          <FormControl display="flex" alignItems="center">
            <Switch isChecked={st.enabled} onChange={(e)=> setWifi(p=>({...p,[r.idx]:{...p[r.idx],enabled:e.target.checked}}))} />
            <FormLabel mb="0" ml={2} color="white">Habilitar Rádio</FormLabel>
          </FormControl>
          <FormControl display="flex" alignItems="center">
            <Checkbox isChecked={st.invisible} onChange={(e)=> setWifi(p=> ({...p,[r.idx]:{...p[r.idx],invisible:e.target.checked}}))} />
            <FormLabel mb="0" ml={2} color="white">Ocultar SSID</FormLabel>
          </FormControl>
        </SimpleGrid>

        <HStack align="start">
          <FormControl>
            <FormLabel color="white">SSID</FormLabel>
            <Input value={st.ssid} onChange={(e)=> setWifi(p=> ({...p, [r.idx]: { ...p[r.idx], ssid: e.target.value }}))} />
          </FormControl>
          <FormControl>
            <FormLabel color="white">Senha</FormLabel>
            <HStack>
              <Input type={st.mostrarSenha?"text":"password"} value={st.senha}
                onChange={(e)=> setWifi(p=> ({...p, [r.idx]: { ...p[r.idx], senha: e.target.value }}))}/>
              <IconButton aria-label="toggle" icon={st.mostrarSenha?<ViewOffIcon/>:<ViewIcon/>}
                onClick={()=> setWifi(p=> ({...p, [r.idx]: { ...p[r.idx], mostrarSenha: !p[r.idx].mostrarSenha }}))} />
            </HStack>
          </FormControl>
        </HStack>

        <SimpleGrid columns={{base:1, md:3}} spacing={4}>
          <FormControl>
            <FormLabel color="white">Segurança</FormLabel>
            <Select value={st.security} onChange={(e)=> setWifi(p=> ({...p,[r.idx]:{...p[r.idx],security:e.target.value as SecurityMode}}))}>
              <option value="mixed">WPA/WPA2 Pessoal (Recomendado)</option>
              <option value="wpa2">WPA2-PSK</option>
              <option value="wpa3">WPA3-Personal</option>
              <option value="open">Sem segurança</option>
            </Select>
          </FormControl>
          <FormControl>
            <FormLabel color="white">Criptografia</FormLabel>
            <Select value={st.crypto} onChange={(e)=> setWifi(p=> ({...p,[r.idx]:{...p[r.idx],crypto:e.target.value as any}}))}>
              <option value="Auto">Auto</option>
              <option value="AES">AES</option>
              <option value="TKIP">TKIP</option>
            </Select>
          </FormControl>
          <Box />
        </SimpleGrid>

        <SimpleGrid columns={{base:1, md:3}} spacing={4}>
          <FormControl>
            <FormLabel color="white">Modo</FormLabel>
            <Select value={st.mode} onChange={(e)=> setWifi(p=> ({...p,[r.idx]:{...p[r.idx],mode:e.target.value}}))}>
              {r.banda==="2.4GHz" ? (
                <>
                  <option>802.11b/g/n mixed</option>
                  <option>802.11b/g mixed</option>
                </>
              ) : (
                <>
                  <option>802.11a/n/ac mixed</option>
                  <option>802.11a/n/ac/ax</option>
                </>
              )}
            </Select>
          </FormControl>

          <FormControl>
            <FormLabel color="white">Canal</FormLabel>
            <Select
              value={st.autoChannel ? "Auto" : st.channel}
              onChange={(e)=>{ const val=e.target.value; setWifi(p=> ({...p,[r.idx]:{...p[r.idx],autoChannel:val==="Auto",channel:val}})); }}
            >
              {channelPool(r.banda).map(ch => (
                <option key={ch} value={ch}>
                  {ch==="Auto" ? `Auto${st.recommended ? ` (${st.recommended})`:''}` : ch}
                </option>
              ))}
            </Select>
          </FormControl>

          <FormControl>
            <FormLabel color="white">Largura do Canal</FormLabel>
            <Select value={st.bandwidth} onChange={(e)=> setWifi(p=> ({...p,[r.idx]:{...p[r.idx],bandwidth:e.target.value}}))}>
              {bandChannels(r.banda).map(bw => <option key={bw} value={bw}>{bw}</option>)}
            </Select>
          </FormControl>
        </SimpleGrid>

        <FormControl>
          <FormLabel color="white">Poder de Transmissão: {st.txPower}%</FormLabel>
          <Slider min={0} max={100} step={10} value={st.txPower} onChange={(v)=> setWifi(p=> ({...p,[r.idx]:{...p[r.idx],txPower:v}}))}>
            <SliderTrack bg="gray.600"><SliderFilledTrack bg="cyan.400"/></SliderTrack>
            <SliderThumb/>
          </Slider>
        </FormControl>
      </VStack>
    );
  };

  const AdvancedCard = (r:{idx:number;banda:Banda}) => {
    const st = wifi[r.idx]; if (!st) return null;
    return (
      <VStack align="stretch" spacing={4} bg="gray.900" p={4} borderRadius="md" border="1px solid" borderColor="whiteAlpha.200">
        <SimpleGrid columns={{base:1, md:3}} spacing={4}>
          <FormControl display="flex" alignItems="center"><Checkbox isChecked={st.wmm} onChange={(e)=> setWifi(p=> ({...p,[r.idx]:{...p[r.idx],wmm:e.target.checked}}))} /><FormLabel mb="0" ml={2} color="white">WMM</FormLabel></FormControl>
          <FormControl display="flex" alignItems="center"><Checkbox isChecked={st.shortGi} onChange={(e)=> setWifi(p=> ({...p,[r.idx]:{...p[r.idx],shortGi:e.target.checked}}))} /><FormLabel mb="0" ml={2} color="white">Short GI</FormLabel></FormControl>
          <FormControl display="flex" alignItems="center"><Checkbox isChecked={st.apIsolation} onChange={(e)=> setWifi(p=> ({...p,[r.idx]:{...p[r.idx],apIsolation:e.target.checked}}))} /><FormLabel mb="0" ml={2} color="white">Isolamento AP</FormLabel></FormControl>
        </SimpleGrid>
        <SimpleGrid columns={{base:1, md:4}} spacing={4}>
          <FormControl><FormLabel color="white">Beacon</FormLabel><Input type="number" value={st.beacon} onChange={(e)=> setWifi(p=> ({...p,[r.idx]:{...p[r.idx],beacon: Number(e.target.value)}}))} /></FormControl>
          <FormControl><FormLabel color="white">RTS</FormLabel><Input type="number" value={st.rts} onChange={(e)=> setWifi(p=> ({...p,[r.idx]:{...p[r.idx],rts: Number(e.target.value)}}))} /></FormControl>
          <FormControl><FormLabel color="white">DTIM</FormLabel><Input type="number" value={st.dtim} onChange={(e)=> setWifi(p=> ({...p,[r.idx]:{...p[r.idx],dtim: Number(e.target.value)}}))} /></FormControl>
          <FormControl><FormLabel color="white">Troca chave grupo (s)</FormLabel><Input type="number" value={st.groupKeyInterval} onChange={(e)=> setWifi(p=> ({...p,[r.idx]:{...p[r.idx],groupKeyInterval: Number(e.target.value)}}))} /></FormControl>
        </SimpleGrid>
        <FormControl display="flex" alignItems="center"><Checkbox isChecked={st.wds} onChange={(e)=> setWifi(p=> ({...p,[r.idx]:{...p[r.idx],wds:e.target.checked}}))} /><FormLabel mb="0" ml={2} color="white">Habilitar WDS Bridging</FormLabel></FormControl>
      </VStack>
    );
  };

  const WpsCard = (r:{idx:number;banda:Banda}) => {
    const st = wifi[r.idx]; if (!st) return null;
    return (
      <VStack align="stretch" spacing={4} bg="gray.900" p={4} borderRadius="md" border="1px solid" borderColor="whiteAlpha.200">
        <FormControl display="flex" alignItems="center"><Switch isChecked={st.wpsEnable} onChange={(e)=> setWifi(p=> ({...p,[r.idx]:{...p[r.idx],wpsEnable:e.target.checked}}))} /><FormLabel mb="0" ml={2} color="white">WPS</FormLabel></FormControl>
        <HStack>
          <Button onClick={()=> startWpsPbc(r.idx)} isDisabled={!st.wpsEnable}>Início WPS (PBC)</Button>
          <FormControl maxW="240px"><FormLabel color="white">PIN</FormLabel><Input value={st.wpsPin||""} onChange={(e)=> setWifi(p=> ({...p,[r.idx]:{...p[r.idx],wpsPin:e.target.value}}))} /></FormControl>
        </HStack>
        <Text fontSize="sm" color="gray.300">O WPS pode ser habilitado/desabilitado em Avançado → WPS (salvo acima).</Text>
      </VStack>
    );
  };

  const MultiSsidCard = (r:{idx:number;banda:Banda}) => {
    const st = wifi[r.idx]; if (!st) return null;
    const list = Array.isArray(st?.multi) ? st.multi : [];
    return (
      <VStack align="stretch" spacing={4} bg="gray.900" p={4} borderRadius="md" border="1px solid" borderColor="whiteAlpha.200">
        {list.length === 0 && <Text fontSize="sm" color="gray.400">Sem SSIDs adicionais configurados.</Text>}
        {list.map((ms, i)=> (
          <Box key={i} borderWidth="1px" borderColor="gray.700" p={3} borderRadius="md">
            <HStack mb={2}>
              <Checkbox isChecked={ms.enable} onChange={(e)=> setWifi(p=>{ const copy={...p}; copy[r.idx].multi[i].enable=e.target.checked; return copy; })} />
              <Text fontWeight="semibold">SSID {i+1}</Text>
            </HStack>
            <SimpleGrid columns={{base:1, md:3}} spacing={4}>
              <FormControl>
                <FormLabel color="white">Nome</FormLabel>
                <Input value={ms.ssid} onChange={(e)=> setWifi(p=>{ const copy={...p}; copy[r.idx].multi[i].ssid=e.target.value; return copy; })} />
              </FormControl>
              <FormControl display="flex" alignItems="center">
                <Checkbox isChecked={ms.hide} onChange={(e)=> setWifi(p=>{ const copy={...p}; copy[r.idx].multi[i].hide=e.target.checked; return copy; })} />
                <FormLabel mb="0" ml={2} color="white">Ocultar</FormLabel>
              </FormControl>
              <FormControl>
                <FormLabel color="white">Segurança</FormLabel>
                <Select value={ms.security} onChange={(e)=> setWifi(p=>{ const copy={...p}; copy[r.idx].multi[i].security=e.target.value as any; return copy; })}>
                  <option value="open">Sem segurança</option>
                  <option value="mixed">WPA/WPA2 Pessoal</option>
                </Select>
              </FormControl>
            </SimpleGrid>
          </Box>
        ))}
        <Text fontSize="sm" color="gray.300">* Mapear paths de Multi-SSID conforme o modelo (ex.: X_TP_MultiSSID...).</Text>
      </VStack>
    );
  };

  const ClientsCard = (r:{idx:number;banda:Banda}) => {
    const st = wifi[r.idx];
    const list: Cliente[] = st?.clientes ?? [];

    return (
      <Box bg="gray.900" p={4} borderRadius="md" border="1px solid" borderColor="whiteAlpha.200">
        <HStack mb={2} justify="space-between">
          <HStack>
            <Text fontWeight="semibold">Clientes Wireless Online</Text>
            <Badge colorScheme="purple">{list.length}</Badge>
          </HStack>
          {st?.recommended ? <Badge colorScheme="green">Canal sugerido: {st.recommended}</Badge> : <Badge colorScheme="gray">Sem sugestão</Badge>}
        </HStack>

        {list.length ? (
          <Box overflowX="auto">
            <Table
              size="sm"
              variant="simple"
              minW="860px"
              sx={{ tableLayout: "fixed" }}   // ✅ evita o warning do React
            >
              <Thead>
                <Tr>
                  <Th color="white" w="200px">MAC</Th>
                  <Th color="white" w="80px">Banda</Th>
                  <Th color="white" w="180px">Sinal</Th>
                  <Th color="white">Tendência</Th>
                  <Th w="120px" />
                </Tr>
              </Thead>

              <Tbody>
                {list.map((c) => {
                  const rssiVal =
                    typeof c.rssi === "string" ? parseInt(c.rssi as any, 10) : c.rssi;

                  return (
                    <Tr key={c.mac}>
                      <Td color="white">
                        <Box as="span" display="inline-block" maxW="184px" isTruncated>
                          <Code>{c.mac}</Code>
                        </Box>
                      </Td>

                      <Td>
                        <Badge>{c.band || r.banda}</Badge>
                      </Td>

                      <Td>{rssiBadge(rssiVal)}</Td>

                      <Td overflow="hidden">
                        {renderSpark(c.mac)}
                      </Td>

                      <Td textAlign="right">
                        <Tooltip label="Desconectar">
                          <Button
                            size="xs"
                            colorScheme="red"
                            onClick={() => desconectarCliente(r.idx, c.mac)}
                          >
                            Desconectar
                          </Button>
                        </Tooltip>
                      </Td>
                    </Tr>
                  );
                })}
              </Tbody>
            </Table>
          </Box>

        ) : (
          <Text color="gray.400" fontSize="sm">Sem clientes associados neste rádio.</Text>
        )}
      </Box>
    );
  };

  // ============ Render ============
  return (
    <Box bg="gray.800" p={4} borderRadius="lg" color="white" maxW="100%" overflowX="hidden">
      {header}

      <Tabs colorScheme="cyan" variant="enclosed" isFitted>
        <TabList>
          {RADIOS.map(r => (
            <Tab key={r.idx} _selected={{ bg:"gray.700" }}>
              <HStack>
                <Tag size="sm" colorScheme="purple"><TagLabel>{r.label}</TagLabel></Tag>
                {wifi[r.idx]?.recommended ? (
                  <Badge ml={2} colorScheme="green">Canal sugerido: {wifi[r.idx]?.recommended}</Badge>
                ) : <Badge ml={2} colorScheme="gray">Sem sugestão</Badge>}
              </HStack>
            </Tab>
          ))}
        </TabList>

        <TabPanels>
          {RADIOS.map(r => {
            const st = wifi[r.idx]; if (!st) return (
              <TabPanel key={r.idx}><Text color="whiteAlpha.700">Carregando…</Text></TabPanel>
            );
            return (
              <TabPanel key={r.idx} px={0}>
                <Grid templateColumns={{ base: "1fr", xl: "420px 1fr" }} gap={6} alignItems="start">
                  <GridItem>
                    {BasicCard(r)}
                    <Box h={4}/>
                    {AdvancedCard(r)}
                    <Box h={4}/>
                    {WpsCard(r)}
                    <Box h={4}/>
                    {MultiSsidCard(r)}
                  </GridItem>

                  <GridItem>
                    <VStack align="stretch" spacing={4}>
                      <Box
                        bg="gray.900"
                        p={4}
                        borderRadius="md"
                        border="1px solid"
                        borderColor="whiteAlpha.200"
                      >
                        <Text fontWeight="semibold" mb={2}>
                          Redes vizinhas detectadas
                        </Text>

                        {scan.length ? (
                          <Box overflowX="auto">
                            <Table
                              size="sm"
                              variant="simple"
                              minW="700px"
                              sx={{ tableLayout: "fixed" }} 
                            >
                              <Thead>
                                <Tr>
                                  <Th color="white" w="45%">SSID</Th>
                                  <Th color="white" w="90px">Banda</Th>
                                  <Th color="white" w="90px">Canal</Th>
                                  <Th color="white">RSSI</Th>
                                </Tr>
                              </Thead>

                              <Tbody>
                                {scan
                                  .filter((s) => (r.banda === "5GHz" ? s.canal >= 36 : s.canal < 36))
                                  .sort((a, b) => b.rssi - a.rssi)
                                  .slice(0, 20)
                                  .map((s, i) => {
                                    const ssid = s?.ssid?.trim() || "—";
                                    const canal = Number.isFinite(s?.canal) ? s.canal : undefined;
                                    const rssiNum =
                                      typeof s?.rssi === "string"
                                        ? parseInt(s.rssi as any, 10)
                                        : s?.rssi;

                                    return (
                                      <Tr key={`${ssid}-${canal ?? "x"}-${i}`}>
                                        <Td
                                          color="white"
                                          overflow="hidden"
                                          textOverflow="ellipsis"
                                          whiteSpace="nowrap"
                                          title={ssid}
                                        >
                                          {ssid}
                                        </Td>
                                        <Td>
                                          <Badge>{canal && canal >= 36 ? "5GHz" : "2.4GHz"}</Badge>
                                        </Td>
                                        <Td>
                                          <Code>{canal ?? "—"}</Code>
                                        </Td>
                                        <Td>{rssiBadge(Number.isFinite(rssiNum) ? (rssiNum as number) : undefined)}</Td>
                                      </Tr>
                                    );
                                  })}
                              </Tbody>
                            </Table>
                          </Box>
                        ) : (
                          <Text color="gray.400" fontSize="sm">
                            Nenhuma rede vizinha disponível para esta banda.
                          </Text>
                        )}
                      </Box>

                      {/* Clientes conectados ao rádio atual */}
                      {ClientsCard(r)}
                    </VStack>
                  </GridItem>
                </Grid>

                <Divider my={6} borderColor="whiteAlpha.200"/>
                <Text fontSize="xs" color="whiteAlpha.500">
                  Dica: “Auto (XX)” mostra o melhor canal sugerido no momento com base na varredura.
                </Text>
              </TabPanel>
            );
          })}
        </TabPanels>
      </Tabs>
    </Box>
  );
}
