import {
  Box, HStack, VStack, Text, Badge, Tooltip, IconButton, Button, Avatar, Spacer, useToast
} from "@chakra-ui/react";
import { RefreshCw, Tag as TagIcon, Wifi, Cpu, Activity, Clock } from "lucide-react";
import { createTask } from "../services/genieAcsApi";

interface Props {
  device: any | null;
  onRefresh?: () => void;
}

const get = (o: any, path: string, fb?: any): any => {
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

export default function DeviceHeader({ device, onRefresh }: Props) {
  const toast = useToast();
  if (!device) return null;

  // GenieACS _id format is usually: <OUI>-<ProductClass>-<SerialNumber>
  // prefer the authoritative _id when present, otherwise build using _OUI if available
  const id =
    device?._id ||
    `${device?._deviceId?._OUI || device?._deviceId?._Manufacturer}-${device?._deviceId?._ProductClass}-${device?._deviceId?._SerialNumber}`;
  const manu  = device?._deviceId?._Manufacturer || "—";
  const model = device?._deviceId?._ProductClass || "—";
  const serial= device?._deviceId?._SerialNumber || "—";
  const login = get(device, "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Username", "—");
  const firmware = get(device, "InternetGatewayDevice.DeviceInfo.SoftwareVersion", "—");
  const lastInform = device?._lastInform || "—";
  const up = get(device, "InternetGatewayDevice.DeviceInfo.UpTime", 0);
  const wanIP = get(device, "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.ExternalIPAddress",
                    get(device,"InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.ExternalIPAddress","—"));
  const wanIpv6 = get(device, "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.X_HW_IPv6Address", "—");
  const tag = device?._tags?.[0] || "";

  const handleInform = async () => {
    try {
      await createTask(id, { name: "getParameterValues", parameterNames: ["InternetGatewayDevice.", "Device."] as any }, true);
      toast({status:"success", title:"Solicitado novo Inform/Get"});
      onRefresh?.();
    } catch (e:any) {
      toast({status:"error", title:"Falha ao solicitar Inform", description: e?.message});
    }
  };

  const fmtUp = (s:number) => {
    const d=Math.floor(s/86400), h=Math.floor((s%86400)/3600), m=Math.floor((s%3600)/60);
    return `${d}d ${h}h ${m}m`;
  };

  return (
    <Box bg="gray.800" p={4} borderRadius="lg" border="1px solid" borderColor="gray.700">
      <HStack align="start" spacing={4}>
        <Avatar name={model} bg="teal.500" />
        <VStack align="start" spacing={1}>
          <HStack>
            <Text fontSize="xl" fontWeight="bold" color="white">{model}</Text>
            {tag ? <Badge colorScheme="purple">{tag}</Badge> : null}
          </HStack>
          <HStack spacing={3} color="gray.300" fontSize="sm">
            <Tooltip label="Login PPPoE"><HStack><Wifi size={16}/><Text>{login}</Text></HStack></Tooltip>
            <Tooltip label="Fabricante / Serial"><HStack><Cpu size={16}/><Text>{manu} • {serial}</Text></HStack></Tooltip>
            <Tooltip label="Uptime"><HStack><Clock size={16}/><Text>{fmtUp(Number(up)||0)}</Text></HStack></Tooltip>
            <Tooltip label="Último Inform"><HStack><Activity size={16}/><Text>{String(lastInform)}</Text></HStack></Tooltip>
          </HStack>
          <HStack spacing={3} fontSize="sm" color="gray.300">
            <Badge colorScheme="green">IPv4: {wanIP}</Badge>
            <Badge colorScheme="blue">IPv6: {wanIpv6}</Badge>
            <Badge colorScheme="gray">FW: {firmware}</Badge>
          </HStack>
        </VStack>
        <Spacer/>
        <HStack>
          <Tooltip label="Atualizar (novo Inform/Get)">
            <IconButton aria-label="refresh" icon={<RefreshCw size={18}/>} onClick={handleInform}/>
          </Tooltip>
          <Button leftIcon={<TagIcon size={16}/>} variant="outline">Tag/Untag</Button>
        </HStack>
      </HStack>
    </Box>
  );
}
