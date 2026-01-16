// src/components/LanConfig.tsx
import {
  Box,
  FormControl,
  FormLabel,
  Input,
  Switch,
  VStack,
  Button,
  HStack,
  useToast,
  Text,
  Tooltip,
  AlertDialog,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  Badge,
} from "@chakra-ui/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createTask } from "../services/genieAcsApi";

interface Props {
  device: any;
}

type FormState = {
  ip: string;
  mascara: string;
  gateway: string;
  dhcp: boolean;
  lease: string;
  ipInicio: string;
  ipFinal: string;
  dns: string;
};

const ipv4Regex =
  /^(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\.(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)$/;

function ipv4ToInt(ip: string): number {
  if (!ipv4Regex.test(ip)) return 0;
  return ip
    .split(".")
    .map((n) => parseInt(n, 10))
    .reduce((acc, v) => (acc << 8) + v, 0) >>> 0;
}

function sameSubnet(ip: string, gw: string, mask: string): boolean {
  if (![ip, gw, mask].every((v) => ipv4Regex.test(v))) return true; // não trava se incompleto
  const ipInt = ipv4ToInt(ip);
  const gwInt = ipv4ToInt(gw);
  const mInt = ipv4ToInt(mask);
  return (ipInt & mInt) === (gwInt & mInt);
}

export default function LanConfig({ device }: Props) {
  const toast = useToast();
  const id = device?._id;

  const getParam = useCallback(
    (path: string) =>
      path
        .split(".")
        .reduce<any>((o, i) => (o && i in o ? o[i] : undefined), device)?._value,
    [device]
  );

  // Fallbacks para diferentes modelos
  const raw = useMemo(() => {
    const ip =
      getParam(
        "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.IPInterface.1.IPInterfaceIPAddress"
      ) ||
      getParam(
        "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.IPAddress"
      ) ||
      "";

    const mascara =
      getParam(
        "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.IPInterface.1.IPInterfaceSubnetMask"
      ) ||
      getParam(
        "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.SubnetMask"
      ) ||
      "";

    const gateway =
      getParam(
        "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.IPRouters"
      ) || "";

    const dhcpAtivo =
      getParam(
        "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.DHCPServerEnable"
      ) ?? false;

    const lease =
      getParam(
        "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.DHCPLeaseTime"
      ) || "";

    const ipInicio =
      getParam(
        "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.MinAddress"
      ) || "";

    const ipFinal =
      getParam(
        "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.MaxAddress"
      ) || "";

    const dns =
      getParam(
        "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.DNSServers"
      ) || "";

    return {
      ip,
      mascara,
      gateway,
      dhcp: dhcpAtivo === "1" || dhcpAtivo === true,
      lease: String(lease ?? ""),
      ipInicio,
      ipFinal,
      dns,
    } as FormState;
  }, [getParam]);

  const [form, setForm] = useState<FormState>(raw);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setForm(raw), [raw]);

  const handleChange = (key: keyof FormState, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [key]: value as any }));
  };

  const valid =
    (!form.ip || ipv4Regex.test(form.ip)) &&
    (!form.mascara || ipv4Regex.test(form.mascara)) &&
    (!form.gateway || ipv4Regex.test(form.gateway)) &&
    (!form.ipInicio || ipv4Regex.test(form.ipInicio)) &&
    (!form.ipFinal || ipv4Regex.test(form.ipFinal)) &&
    (!form.dns ||
      form.dns
        .split(/[,\s]+/)
        .filter(Boolean)
        .every((d) => ipv4Regex.test(d)));

  const subnetOK = sameSubnet(form.ip, form.gateway, form.mascara);

  const changed = useMemo(() => JSON.stringify(form) !== JSON.stringify(raw), [form, raw]);

  const applyChanges = async () => {
    if (!id) return;

    setSaving(true);
    const parametros: [string, string, string][] = [
      [
        "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.IPInterface.1.IPInterfaceIPAddress",
        form.ip,
        "xsd:string",
      ],
      [
        "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.IPInterface.1.IPInterfaceSubnetMask",
        form.mascara,
        "xsd:string",
      ],
      [
        "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.IPRouters",
        form.gateway,
        "xsd:string",
      ],
      [
        "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.DHCPServerEnable",
        String(form.dhcp),
        "xsd:boolean",
      ],
      [
        "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.DHCPLeaseTime",
        form.lease || "0",
        "xsd:unsignedInt",
      ],
      [
        "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.MinAddress",
        form.ipInicio,
        "xsd:string",
      ],
      [
        "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.MaxAddress",
        form.ipFinal,
        "xsd:string",
      ],
      [
        "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.DNSServers",
        form.dns,
        "xsd:string",
      ],
    ];

    try {
      await createTask(id, {
        name: "setParameterValues",
        parameterValues: parametros,
      });

      await createTask(id, { name: "reboot" });

      toast({
        status: "success",
        title: "Configurações aplicadas",
        description: "A CPE será reiniciada para efetivar as alterações.",
      });
      setConfirmOpen(false);
    } catch (err: any) {
      toast({
        status: "error",
        title: "Erro ao aplicar configurações",
        description: err?.message || "Falha desconhecida",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box bg="gray.800" p={5} borderRadius="xl" shadow="md">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setConfirmOpen(true);
        }}
      >
        <VStack spacing={4} align="start">
          <HStack w="full" spacing={4}>
            <FormControl>
              <FormLabel>IP da LAN</FormLabel>
              <Input
                value={form.ip}
                onChange={(e) => handleChange("ip", e.target.value)}
                isInvalid={!!form.ip && !ipv4Regex.test(form.ip)}
                placeholder="Ex.: 192.168.1.1"
              />
            </FormControl>

            <FormControl>
              <FormLabel>Máscara</FormLabel>
              <Input
                value={form.mascara}
                onChange={(e) => handleChange("mascara", e.target.value)}
                isInvalid={!!form.mascara && !ipv4Regex.test(form.mascara)}
                placeholder="Ex.: 255.255.255.0"
              />
            </FormControl>
          </HStack>

          <HStack w="full" spacing={4}>
            <FormControl>
              <FormLabel>Gateway</FormLabel>
              <Input
                value={form.gateway}
                onChange={(e) => handleChange("gateway", e.target.value)}
                isInvalid={!!form.gateway && !ipv4Regex.test(form.gateway)}
                placeholder="Ex.: 192.168.1.254"
              />
            </FormControl>

            <FormControl>
              <FormLabel>DHCP Ativo</FormLabel>
              <Switch
                isChecked={form.dhcp}
                onChange={(e) => handleChange("dhcp", e.target.checked)}
              />
            </FormControl>
          </HStack>

          <HStack w="full" spacing={4}>
            <FormControl isDisabled={!form.dhcp}>
              <FormLabel>Lease Time (s)</FormLabel>
              <Input
                value={form.lease}
                onChange={(e) => handleChange("lease", e.target.value)}
                placeholder="Ex.: 86400"
              />
            </FormControl>

            <Tooltip
              label={!subnetOK ? "IP e Gateway parecem estar em sub-redes diferentes." : ""}
              isDisabled={subnetOK}
            >
              <Badge colorScheme={subnetOK ? "green" : "red"} mt={8} ml={1}>
                {subnetOK ? "Sub-rede OK" : "Sub-rede inconsistente"}
              </Badge>
            </Tooltip>
          </HStack>

          <HStack w="full" spacing={4}>
            <FormControl isDisabled={!form.dhcp}>
              <FormLabel>IP Inicial</FormLabel>
              <Input
                value={form.ipInicio}
                onChange={(e) => handleChange("ipInicio", e.target.value)}
                isInvalid={!!form.ipInicio && !ipv4Regex.test(form.ipInicio)}
                placeholder="Ex.: 192.168.1.10"
              />
            </FormControl>
            <FormControl isDisabled={!form.dhcp}>
              <FormLabel>IP Final</FormLabel>
              <Input
                value={form.ipFinal}
                onChange={(e) => handleChange("ipFinal", e.target.value)}
                isInvalid={!!form.ipFinal && !ipv4Regex.test(form.ipFinal)}
                placeholder="Ex.: 192.168.1.200"
              />
            </FormControl>
          </HStack>

          <FormControl>
            <FormLabel>DNS (separar por vírgula ou espaço)</FormLabel>
            <Input
              value={form.dns}
              onChange={(e) => handleChange("dns", e.target.value)}
              isInvalid={
                !!form.dns &&
                !form.dns
                  .split(/[,\s]+/)
                  .filter(Boolean)
                  .every((d) => ipv4Regex.test(d))
              }
              placeholder="Ex.: 1.1.1.1, 8.8.8.8"
            />
          </FormControl>

          <HStack w="full" justify="space-between">
            <Text fontSize="sm" color="gray.400">
              As alterações serão aplicadas via <b>setParameterValues</b> e a CPE
              será reiniciada.
            </Text>
            <Button
              type="submit"
              colorScheme="green"
              isLoading={saving}
              isDisabled={!valid || !changed}
            >
              Salvar
            </Button>
          </HStack>
        </VStack>
      </form>

      {/* Confirmação de reboot */}
      <AlertDialog
        isOpen={confirmOpen}
        leastDestructiveRef={cancelRef}
        onClose={() => setConfirmOpen(false)}
      >
        <AlertDialogOverlay>
          <AlertDialogContent bg="gray.800" color="white">
            <AlertDialogHeader fontSize="lg" fontWeight="bold">
              Aplicar configurações e reiniciar a CPE?
            </AlertDialogHeader>

            <AlertDialogBody>
              Ao confirmar, enviaremos os parâmetros e executaremos <b>reboot</b>.
            </AlertDialogBody>

            <AlertDialogFooter>
              <Button ref={cancelRef} onClick={() => setConfirmOpen(false)}>
                Cancelar
              </Button>
              <Button
                colorScheme="green"
                onClick={applyChanges}
                ml={3}
                isLoading={saving}
              >
                Confirmar
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>
    </Box>
  );
}
