// src/components/FirewallPortas.tsx
import {
  Box,
  Heading,
  VStack,
  HStack,
  Input,
  Select,
  Button,
  IconButton,
  useToast,
  Text,
  Badge,
  Switch,
  Tooltip,
} from "@chakra-ui/react";
import { Plus, Trash2, Info } from "lucide-react";
import { setParameterValues, createTask } from "../services/genieAcsApi";
import { useState, useMemo } from "react";

type Proto = "TCP" | "UDP" | "TCP/UDP";

interface Row {
  enable: boolean;
  extPort: string;
  intPort: string;
  proto: Proto;
  intClient: string;
  desc: string;
}

interface Props {
  device: any;
}

/** Detecta suporte TR-181 (preferência) ou TR-098 como fallback */
function pathBase(device: any) {
  const is181 = !!device?.Device?.NAT?.PortMapping;
  if (is181) return { base: "Device.NAT.PortMapping.", is181: true };
  return {
    base:
      "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.PortMapping.",
    is181: false,
  };
}

const PORT_RE = /^\d{1,5}$/;
const IPV4_RE =
  /^(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)){3}$/;

export default function FirewallPortas({ device }: Props) {
  const toast = useToast();

  const [rows, setRows] = useState<Row[]>([
    { enable: true, extPort: "", intPort: "", proto: "TCP", intClient: "", desc: "" },
  ]);

  const addRow = () =>
    setRows((r) => [
      ...r,
      { enable: true, extPort: "", intPort: "", proto: "TCP", intClient: "", desc: "" },
    ]);

  const delRow = (i: number) => setRows((r) => r.filter((_, idx) => idx !== i));

  const upd = (i: number, key: keyof Row, val: any) =>
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, [key]: val } : row)));

  const anyInvalid = useMemo(() => {
    for (const r of rows) {
      if (!r.extPort || !PORT_RE.test(r.extPort) || Number(r.extPort) < 1 || Number(r.extPort) > 65535)
        return true;
      if (!r.intPort || !PORT_RE.test(r.intPort) || Number(r.intPort) < 1 || Number(r.intPort) > 65535)
        return true;
      if (!r.intClient || !IPV4_RE.test(r.intClient)) return true;
    }
    return false;
  }, [rows]);

  const salvar = async () => {
    if (!device?._id) {
      toast({ status: "warning", title: "Dispositivo inválido (sem _id)." });
      return;
    }
    if (rows.length === 0) {
      toast({ status: "warning", title: "Adicione ao menos uma regra." });
      return;
    }
    if (anyInvalid) {
      toast({
        status: "warning",
        title: "Campos inválidos",
        description:
          "Verifique portas (1–65535) e IP interno (IPv4).",
      });
      return;
    }

    const { base, is181 } = pathBase(device);
    const params: { name: string; value: string; type: string }[] = [];

    rows.forEach((r, idx) => {
      const i = idx + 1; // cria/sobrescreve índices 1..N
      const P = (s: string) => `${base}${i}.${s}`;
      if (is181) {
        params.push({ name: P("Enable"), value: String(r.enable), type: "xsd:boolean" });
        params.push({ name: P("Description"), value: r.desc || "", type: "xsd:string" });
        params.push({
          name: P("Protocol"),
          value: r.proto === "TCP/UDP" ? "TCP/UDP" : r.proto,
          type: "xsd:string",
        });
        params.push({
          name: P("ExternalPort"),
          value: r.extPort,
          type: "xsd:unsignedInt",
        });
        params.push({ name: P("InternalClient"), value: r.intClient, type: "xsd:string" });
        params.push({
          name: P("InternalPort"),
          value: r.intPort,
          type: "xsd:unsignedInt",
        });
      } else {
        params.push({
          name: P("PortMappingEnabled"),
          value: String(r.enable),
          type: "xsd:boolean",
        });
        params.push({
          name: P("PortMappingDescription"),
          value: r.desc || "",
          type: "xsd:string",
        });
        params.push({
          name: P("PortMappingProtocol"),
          value: r.proto === "TCP/UDP" ? "TCP/UDP" : r.proto,
          type: "xsd:string",
        });
        params.push({
          name: P("ExternalPort"),
          value: r.extPort,
          type: "xsd:unsignedInt",
        });
        params.push({ name: P("InternalClient"), value: r.intClient, type: "xsd:string" });
        params.push({
          name: P("InternalPort"),
          value: r.intPort,
          type: "xsd:unsignedInt",
        });
      }
    });

    try {
      if (params.length) await setParameterValues(device._id, params as any);
      // Connection Request + reboot para efetivar em alguns modelos
      await createTask(device._id, { name: "reboot" }, true);
      toast({
        status: "success",
        title: "Regras NAT aplicadas",
        description: "A CPE será reiniciada para efetivar as alterações.",
      });
    } catch (e: any) {
      toast({
        status: "error",
        title: "Falha ao aplicar NAT",
        description: String(e?.message || e),
      });
    }
  };

  return (
    <Box
      bg="gray.800"
      p={4}
      borderRadius="xl"
      border="1px solid"
      borderColor="whiteAlpha.200"
    >
      <HStack justify="space-between" mb={2}>
        <Heading size="sm" color="whiteAlpha.900">
          🛡️ NAT / Port Mapping
        </Heading>
        <HStack>
          <Badge colorScheme="purple">{pathBase(device).is181 ? "TR-181" : "TR-098"}</Badge>
          <Tooltip label="Algumas CPEs exigem reinício para aplicar mapeamentos.">
            <Info size={16} />
          </Tooltip>
        </HStack>
      </HStack>

      <VStack align="stretch" spacing={3}>
        {rows.map((r, i) => {
          const extErr =
            !r.extPort || !PORT_RE.test(r.extPort) || +r.extPort < 1 || +r.extPort > 65535;
          const intErr =
            !r.intPort || !PORT_RE.test(r.intPort) || +r.intPort < 1 || +r.intPort > 65535;
          const ipErr = !r.intClient || !IPV4_RE.test(r.intClient);

          return (
            <HStack
              key={i}
              spacing={2}
              align="center"
              bg="blackAlpha.300"
              p={3}
              borderRadius="md"
            >
              <HStack minW="110px">
                <Text fontSize="sm" color="whiteAlpha.800">
                  Ativo
                </Text>
                <Switch
                  isChecked={r.enable}
                  onChange={(e) => upd(i, "enable", e.target.checked)}
                  size="sm"
                />
              </HStack>

              <Select
                value={r.proto}
                onChange={(e) => upd(i, "proto", e.target.value as Proto)}
                maxW="140px"
                size="sm"
                bg="blackAlpha.500"
              >
                <option value="TCP">TCP</option>
                <option value="UDP">UDP</option>
                <option value="TCP/UDP">TCP/UDP</option>
              </Select>

              <Input
                placeholder="Porta Externa"
                value={r.extPort}
                onChange={(e) => upd(i, "extPort", e.target.value)}
                size="sm"
                maxW="150px"
                isInvalid={extErr}
                bg="blackAlpha.500"
              />

              <Input
                placeholder="IP Interno (Cliente)"
                value={r.intClient}
                onChange={(e) => upd(i, "intClient", e.target.value)}
                size="sm"
                maxW="210px"
                isInvalid={ipErr}
                bg="blackAlpha.500"
              />

              <Input
                placeholder="Porta Interna"
                value={r.intPort}
                onChange={(e) => upd(i, "intPort", e.target.value)}
                size="sm"
                maxW="150px"
                isInvalid={intErr}
                bg="blackAlpha.500"
              />

              <Input
                placeholder="Descrição (opcional)"
                value={r.desc}
                onChange={(e) => upd(i, "desc", e.target.value)}
                size="sm"
                bg="blackAlpha.500"
              />

              <IconButton
                aria-label="Remover"
                icon={<Trash2 size={16} />}
                size="sm"
                variant="ghost"
                onClick={() => delRow(i)}
              />
            </HStack>
          );
        })}

        <HStack>
          <Button
            leftIcon={<Plus size={16} />}
            onClick={addRow}
            size="sm"
            variant="outline"
          >
            Adicionar Regra
          </Button>
          <Button
            colorScheme="green"
            onClick={salvar}
            size="sm"
            isDisabled={anyInvalid}
          >
            Salvar e Aplicar
          </Button>
          <Badge colorScheme="yellow">
            Pode reiniciar para efetivar em alguns modelos
          </Badge>
        </HStack>
      </VStack>
    </Box>
  );
}
