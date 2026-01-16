// src/components/WanStatus.tsx
import {
  Box, SimpleGrid, Stat, StatLabel, StatNumber, StatHelpText,
  Badge, HStack, VStack, Text, Icon, Code,
  Wrap, WrapItem, Progress, useColorModeValue,
} from "@chakra-ui/react";
import { FiGlobe, FiActivity, FiArrowDownCircle, FiArrowUpCircle, FiShield } from "react-icons/fi";
import { MdLan, MdOutlineLan } from "react-icons/md";
import { TbWorldWww, TbNetwork, TbPlugConnected, TbPlugConnectedX } from "react-icons/tb";

type AnyObj = Record<string, any>;

/** getter tolerante: usa _value se existir, garante primitivos */
function g(o: AnyObj | undefined, path: string, fb?: any): any {
  if (!o) return fb;
  let cur: any = o;
  for (const k of path.split(".")) {
    cur = cur?.[k];
    if (cur === undefined) return fb;
  }
  // Extrair _value se for objeto TR-069
  if (cur && typeof cur === 'object') {
    if ('_value' in cur) return cur._value ?? fb;
    // É um objeto estrutural (ex: _object, _writable), não um valor
    return fb;
  }
  return cur ?? fb;
}

function fmtBytes(n?: number | string) {
  const x = Number(n ?? 0);
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0, v = x;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${isFinite(v) ? v.toFixed(1) : "0.0"} ${u[i]}`;
}

function fmtTime(s?: number | string) {
  const x = Number(s ?? 0);
  const d = Math.floor(x / 86400);
  const h = Math.floor((x % 86400) / 3600);
  const m = Math.floor((x % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
}

function firstTruthy<T = any>(...vals: (T | undefined | null | false | "")[]) {
  return vals.find(v => v !== undefined && v !== null && v !== "" && v !== false);
}

interface Props {
  device: AnyObj | null;
  /** opcional: index do dump CSV (param->valor) para enriquecer velocidades/duplex se vier depois */
  csvIndex?: Record<string, string>;
}

export default function WanStatus({ device, csvIndex }: Props) {
  const cardBg = useColorModeValue("gray.800", "gray.800");
  if (!device) return null;

  // ===== Raízes úteis
  const root = device?.InternetGatewayDevice ?? {};
  const wan1 = g(root, "WANDevice.1", {});               // muitos TP-Link usam .1
  const wan2 = g(root, "WANDevice.2", {});               // alguns expõem .2 também

  // Conexões (PPP preferido)
  const ppp1 = g(wan1, "WANConnectionDevice.1.WANPPPConnection.1", {});
  const ppp2 = g(wan2, "WANConnectionDevice.1.WANPPPConnection.1", {});
  const ipoe1 = g(wan1, "WANConnectionDevice.1.WANIPConnection.1", {});
  const ipoe2 = g(wan2, "WANConnectionDevice.1.WANIPConnection.1", {});

  const PPP = Object.keys(ppp1).length ? ppp1 : ppp2;
  const IPOE = Object.keys(ipoe1).length ? ipoe1 : ipoe2;

  // Físico WAN + comuns
  const wanEth =
    g(wan1, "WANEthernetInterfaceConfig.1", {}) ||
    g(wan2, "WANEthernetInterfaceConfig.1", {});
  const wanCommon =
    g(wan1, "WANCommonInterfaceConfig", {}) ||
    g(wan2, "WANCommonInterfaceConfig", {});

  // ===== Cabeçalho (PPP/IPoE + IPv4)
  const login = firstTruthy(
    g(PPP, "Username"),
    g(IPOE, "Name"),
    "—",
  );

  const ipv4 = firstTruthy(
    g(PPP, "ExternalIPAddress"),
    g(IPOE, "ExternalIPAddress"),
    "—",
  );

  const dns = firstTruthy(
    g(PPP, "DNSServers"),
    g(IPOE, "DNSServers"),
    "—",
  );

  const gw = firstTruthy(
    g(PPP, "DefaultGateway"),
    g(IPOE, "DefaultGateway"),
    "—",
  );

  const mtu = firstTruthy(
    g(PPP, "MaxMRUSize"),
    g(IPOE, "MaxMTUSize"),
    "—",
  );

  const connTime = firstTruthy(
    g(PPP, "ConnectionTime", 0),
    g(IPOE, "Uptime", 0),
    0
  );

  // Conectado? (várias heurísticas)
  const connStatus = firstTruthy(
    g(PPP, "ConnectionStatus"),
    g(IPOE, "ConnectionStatus"),
    g(PPP, "X_TP_IfName"),           // ppp0 etc
    ipv4 !== "—" ? "Connected" : undefined
  );
  const connected = !!connStatus && String(connStatus).toLowerCase() !== "disconnected";

  // ===== IPv6 (TP-Link + genéricos) — usa PPP primeiro (seus dumps)
  const ipv6Enabled = !!firstTruthy(
    g(PPP,  "X_TP_IPv6Enabled"),
    g(PPP,  "X_TP_IPv6Enable"),
    g(IPOE, "X_TP_IPv6Enabled"),
    g(IPOE, "IPv6Enable"),
    false
  );

  const ipv6Addr = firstTruthy(
    g(PPP,  "X_TP_ExternalIPv6Address"),
    g(IPOE, "X_HW_IPv6Address"),
    g(IPOE, "IPv6Address"),
    "—"
  );

  const ipv6Dns = firstTruthy(
    g(PPP,  "X_TP_IPv6DNSServers"),
    g(IPOE, "X_TP_IPv6DNSServers"),
    g(IPOE, "DNSWANIPv6Servers"),
    "—"
  );

  const ipv6Gw = firstTruthy(
    g(PPP,  "X_TP_DefaultIPv6Gateway"),
    g(IPOE, "DefaultIPv6Gateway"),
    "—"
  );

  const ipv6Prefix = firstTruthy(
    g(IPOE, "X_000631_DelegatedIPv6Prefix"),
    g(IPOE, "IPv6Prefix"),
    "—"
  );

  // ===== Throughput/contadores
  const rx = Number(firstTruthy(
    g(PPP, "Stats.BytesReceived"),
    g(IPOE,"Stats.BytesReceived"),
    g(wanCommon, "TotalBytesReceived"),
    0
  ));
  const tx = Number(firstTruthy(
    g(PPP, "Stats.BytesSent"),
    g(IPOE,"Stats.BytesSent"),
    g(wanCommon, "TotalBytesSent"),
    0
  ));

  const maxDown = Number(firstTruthy(
    g(wanCommon, "Layer1DownstreamMaxBitRate"), 0
  ));
  const maxUp = Number(firstTruthy(
    g(wanCommon, "Layer1UpstreamMaxBitRate"), 0
  ));
  const fmtRate = (b: number) => b ? `${(b/1_000_000).toFixed(0)} Mb/s` : "AUTO Mb/s";

  // ===== WAN física: status/speed/duplex
  const wanPhyStatus = String(firstTruthy(
    g(wanEth, "Status"),
    g(wanEth, "Upstream"),   // raros
    "Unknown"
  ));

  const wanPhySpeed = firstTruthy(
    g(wanEth, "MaxBitRate"),
    g(wanEth, "CurrentBitRate"),
    g(wanEth, "Speed"),
    csvIndex?.["InternetGatewayDevice.WANDevice.1.WANEthernetInterfaceConfig.1.Speed"],
    "AUTO Mb/s"
  );

  const wanPhyDuplex = firstTruthy(
    g(wanEth, "DuplexMode"),
    csvIndex?.["InternetGatewayDevice.WANDevice.1.WANEthernetInterfaceConfig.1.DuplexMode"],
    "—"
  );

  // ===== Portas LAN (com velocidade/duplex quando existir)
  const lanRoot: AnyObj | undefined = g(root, "LANDevice.1.LANEthernetInterfaceConfig");
  const lanPorts: Array<{ name: string; status: string; speed: string; duplex: string; idx: string }> = [];

  if (lanRoot && typeof lanRoot === "object") {
    for (const k of Object.keys(lanRoot)) {
      if (!/^\d+$/.test(k)) continue;
      const base = `LANDevice.1.LANEthernetInterfaceConfig.${k}`;
      const name = firstTruthy(
        g(root, `${base}.Name`),
        `LAN${k}`
      );
      const status = String(firstTruthy(g(root, `${base}.Status`), "Unknown"));
      const speed = firstTruthy(
        g(root, `${base}.MaxBitRate`),
        g(root, `${base}.X_TP_NegotiationSpeed`),
        g(root, `${base}.CurrentBitRate`),
        csvIndex?.[`InternetGatewayDevice.${base}.MaxBitRate`],
        "AUTO Mb/s"
      );
      const duplex = firstTruthy(
        g(root, `${base}.DuplexMode`),
        csvIndex?.[`InternetGatewayDevice.${base}.DuplexMode`],
        "—"
      );
      lanPorts.push({ name, status, speed: String(speed), duplex: String(duplex), idx: k });
    }
  }
  if (!lanPorts.length) {
    ["1","2","3","4"].forEach(k => lanPorts.push({ name:`LAN${k}`, status:"Unknown", speed:"AUTO Mb/s", duplex:"—", idx:k }));
  }

  return (
    <Box bg={cardBg} p={4} borderRadius="lg" border="1px solid" borderColor="whiteAlpha.200">
      {/* Título */}
      <HStack justify="space-between" mb={3}>
        <HStack spacing={2}>
          <Icon as={MdLan} />
          <Text fontWeight="semibold">Interfaces de internet</Text>
          <Wrap ml={2}>
            <WrapItem><Badge>PPP</Badge></WrapItem>
            <WrapItem><Badge>IPv4</Badge></WrapItem>
            <WrapItem><Badge>IPv6</Badge></WrapItem>
          </Wrap>
        </HStack>
        {connected ? <Badge colorScheme="green" variant="solid">CONECTADA</Badge> : <Badge colorScheme="red">DESCONEXA</Badge>}
      </HStack>

      {/* Linha principal PPP/IPv4/DNS */}
      <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
        <Stat>
          <StatLabel color="whiteAlpha.700">
            <HStack spacing={2}><Icon as={TbWorldWww}/><Text>Usuário PPPoE</Text></HStack>
          </StatLabel>
          <StatNumber color="white" fontSize="lg">{login}</StatNumber>
          <StatHelpText color="whiteAlpha.600">
            <HStack spacing={2}><Icon as={FiActivity}/><Text>Tempo conectado: {fmtTime(connTime)}</Text></HStack>
          </StatHelpText>
        </Stat>

        <Stat>
          <StatLabel color="whiteAlpha.700">
            <HStack spacing={2}><Icon as={FiGlobe}/><Text>Endereço IPv4</Text></HStack>
          </StatLabel>
          <StatNumber color="white" fontSize="lg">{ipv4}</StatNumber>
          <StatHelpText color="whiteAlpha.600">
            <HStack spacing={4} wrap="wrap">
              <HStack spacing={2}><Icon as={TbNetwork}/><Text>Gateway: {gw || "—"}</Text></HStack>
              <HStack spacing={2}><Icon as={FiShield}/><Text>MTU/MRU: {mtu || "—"}</Text></HStack>
            </HStack>
          </StatHelpText>
        </Stat>

        <Stat>
          <StatLabel color="whiteAlpha.700">
            <HStack spacing={2}><Icon as={FiGlobe}/><Text>DNS</Text></HStack>
          </StatLabel>
          <StatNumber color="white" fontSize="lg">{String(dns)}</StatNumber>
          <StatHelpText color="whiteAlpha.600">Preferencialmente prim/alt</StatHelpText>
        </Stat>
      </SimpleGrid>

      {/* Down/Up máximos + contadores */}
      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4} mt={4}>
        <Box p={3} borderRadius="md" border="1px solid" borderColor="whiteAlpha.200">
          <HStack mb={2} spacing={2}>
            <Icon as={FiArrowDownCircle}/><Text fontWeight="semibold">Downstream</Text>
            <Badge variant="outline">{fmtRate(maxDown)}</Badge>
          </HStack>
          <Text fontSize="sm" color="whiteAlpha.800">Total recebido: {fmtBytes(rx)}</Text>
          <Progress mt={2} value={rx ? 100 : 0} size="xs" colorScheme="cyan" />
        </Box>
        <Box p={3} borderRadius="md" border="1px solid" borderColor="whiteAlpha.200">
          <HStack mb={2} spacing={2}>
            <Icon as={FiArrowUpCircle}/><Text fontWeight="semibold">Upstream</Text>
            <Badge variant="outline">{fmtRate(maxUp)}</Badge>
          </HStack>
          <Text fontSize="sm" color="whiteAlpha.800">Total enviado: {fmtBytes(tx)}</Text>
          <Progress mt={2} value={tx ? 100 : 0} size="xs" colorScheme="cyan" />
        </Box>
      </SimpleGrid>

      {/* IPv6 */}
      <Box mt={4} p={3} bg="blackAlpha.300" borderRadius="md" border="1px solid" borderColor="whiteAlpha.200">
        <HStack justify="space-between" mb={2}>
          <HStack spacing={2}>
            <Icon as={FiGlobe} />
            <Text fontWeight="semibold">IPv6</Text>
            <Badge ml={2} colorScheme={ipv6Enabled ? "green" : "gray"}>
              {ipv6Enabled ? "HABILITADO" : "DESABILITADO"}
            </Badge>
          </HStack>
        </HStack>
        <SimpleGrid columns={{ base: 1, md: 4 }} spacing={4}>
          <VStack align="stretch" spacing={1}>
            <Text fontSize="xs" color="whiteAlpha.700">Endereço</Text>
            <Code fontSize="sm" colorScheme="purple">{ipv6Addr}</Code>
          </VStack>
          <VStack align="stretch" spacing={1}>
            <Text fontSize="xs" color="whiteAlpha.700">Prefixo / Delegado</Text>
            <Code fontSize="sm" colorScheme="purple">{ipv6Prefix}</Code>
          </VStack>
          <VStack align="stretch" spacing={1}>
            <Text fontSize="xs" color="whiteAlpha.700">Gateway</Text>
            <Code fontSize="sm" colorScheme="purple">{ipv6Gw}</Code>
          </VStack>
          <VStack align="stretch" spacing={1}>
            <Text fontSize="xs" color="whiteAlpha.700">DNSv6</Text>
            <Code fontSize="sm" colorScheme="purple">{ipv6Dns}</Code>
          </VStack>
        </SimpleGrid>
      </Box>

      {/* WAN física */}
      <Box mt={6}>
        <HStack spacing={2} mb={2}>
          <Icon as={MdOutlineLan} />
          <Text fontWeight="semibold">Porta WAN</Text>
        </HStack>
        <Wrap>
          <WrapItem>
            <HStack
              px={3} py={2}
              borderRadius="md"
              border="1px solid"
              borderColor={/^up/i.test(wanPhyStatus) ? "green.500" : "whiteAlpha.300"}
              bg={/^up/i.test(wanPhyStatus) ? "green.900" : "blackAlpha.400"}
              spacing={3}
            >
              <Icon as={/^up/i.test(wanPhyStatus) ? TbPlugConnected : TbPlugConnectedX} />
              <Text fontWeight="semibold">WAN</Text>
              <Badge variant="subtle">{String(wanPhyStatus).toUpperCase()}</Badge>
              <Badge variant="outline">{String(wanPhySpeed).toUpperCase()}</Badge>
              <Badge variant="outline">{String(wanPhyDuplex).toUpperCase()}</Badge>
            </HStack>
          </WrapItem>
        </Wrap>
      </Box>

      {/* Portas LAN */}
      <Box mt={6}>
        <HStack spacing={2} mb={2}>
          <Icon as={MdOutlineLan} />
          <Text fontWeight="semibold">Portas físicas</Text>
        </HStack>
        <Wrap>
          {lanPorts.map((p, i) => {
            const up = /^up/i.test(p.status) || /connected/i.test(p.status);
            return (
              <WrapItem key={i}>
                <HStack
                  px={3} py={2}
                  borderRadius="md"
                  border="1px solid"
                  borderColor={up ? "green.500" : "whiteAlpha.300"}
                  bg={up ? "green.900" : "blackAlpha.400"}
                  spacing={3}
                >
                  <Icon as={up ? TbPlugConnected : TbPlugConnectedX} />
                  <Text fontWeight="semibold">{p.name}</Text>
                  <Badge variant="subtle">{up ? "UP" : "DOWN"}</Badge>
                  <Badge variant="outline">{String(p.speed).toUpperCase()}</Badge>
                  <Badge variant="outline">{String(p.duplex).toUpperCase()}</Badge>
                </HStack>
              </WrapItem>
            );
          })}
        </Wrap>
      </Box>
    </Box>
  );
}
