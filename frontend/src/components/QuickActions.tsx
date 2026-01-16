import { Box, HStack, Button, useToast, Tooltip } from "@chakra-ui/react";
import { Power, RefreshCw, Download, Settings2 } from "lucide-react";
import { createTask, enviarDownloadDiagnostics } from "../services/genieAcsApi";

interface Props {
  device: any;
  onAfter?: () => void;
}

export default function QuickActions({ device, onAfter }: Props){
  const toast = useToast();
  // GenieACS _id format is usually: <OUI>-<ProductClass>-<SerialNumber>
  // prefer the authoritative _id when present, otherwise build using _OUI if available
  const id =
    device?._id ||
    `${device?._deviceId?._OUI || device?._deviceId?._Manufacturer}-${device?._deviceId?._ProductClass}-${device?._deviceId?._SerialNumber}`;

  const doTask = async (fn: ()=>Promise<any>, msgOk:string, msgErr:string) => {
    try { await fn(); toast({status:"success", title: msgOk}); onAfter?.(); }
    catch (e:any){ toast({status:"error", title: msgErr, description: e?.message}); }
  };

  return (
    <Box bg="gray.800" p={4} borderRadius="lg" border="1px solid" borderColor="gray.700">
      <HStack spacing={3} wrap="wrap">
        <Tooltip label="Reiniciar a CPE (TR-069)"><Button leftIcon={<Power size={16}/>} colorScheme="orange"
          onClick={()=> doTask(()=>createTask(id,{name:"reboot"},true), "Reboot enviado", "Falha no reboot")}>Reboot</Button></Tooltip>
        <Tooltip label="Reset de fábrica (cuidado!)"><Button leftIcon={<Settings2 size={16}/>} colorScheme="red" variant="outline"
          onClick={()=> doTask(()=>createTask(id,{name:"factoryReset"},true),"Reset solicitado","Falha no reset")}>Factory Reset</Button></Tooltip>
        <Tooltip label="Forçar novo Inform/Get"><Button leftIcon={<RefreshCw size={16}/>} variant="outline"
          onClick={()=> doTask(()=>createTask(id,{name:"getParameterValues", parameterNames:["InternetGatewayDevice.","Device."] as any},true),"Get solicitado","Falha ao solicitar Get")}>Inform/Get</Button></Tooltip>
        <Tooltip label="TR-069 DownloadDiagnostics"><Button leftIcon={<Download size={16}/>} colorScheme="cyan"
          onClick={()=> doTask(()=>enviarDownloadDiagnostics(id),"DownloadDiagnostics enviado","Falha no DownloadDiagnostics")}>Diagnóstico</Button></Tooltip>
      </HStack>
    </Box>
  );
}
