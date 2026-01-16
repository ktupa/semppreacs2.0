import { useEffect, useState } from "react";
import {
  Box, Text, HStack, VStack, Badge, SkeletonText, Table, Thead, Tr, Th, Tbody, Td,
  Code, Alert, AlertIcon, SimpleGrid, Divider, Tooltip, Icon
} from "@chakra-ui/react";
import {
  getIxcByLogin,
  getIxcClienteFullByLogin,
  humanizeSeconds,
  type IxcClienteOut,
  type IxcClienteFullOut
} from "../services/genieAcsApi";
import { FiCpu, FiGlobe, FiWifi, FiHash, FiClock, FiServer, FiActivity } from "react-icons/fi";

type DataUnion = IxcClienteFullOut | (IxcClienteOut & { raw?: any });

export default function ClienteIXC({ login }: { login?: string | null }) {
  const [data, setData] = useState<DataUnion | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!login) { setData({ found: false, login: "", message: "Sem login PPPoE" } as any); return; }
      setLoading(true);

      // 1) tenta endpoint completo
      const full = await getIxcClienteFullByLogin(login);
      if (active && full?.found) {
        setData(full);
        setLoading(false);
        return;
      }

      // 2) fallback para o básico (radusuarios)
      const basic = await getIxcByLogin(login);
      if (active) setData(basic as any);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [login]);

  if (loading) return <SkeletonText noOfLines={8} spacing="3" />;
  if (!data) return null;

  if (!data.found) {
    return (
      <Alert status="warning" variant="subtle" bg="yellow.900" borderColor="yellow.600" borderWidth="1px" rounded="md">
        <AlertIcon />
        {data.message || `Não foi possível obter dados no IXC para este login${login ? ` (${login})` : ""}.`}
      </Alert>
    );
  }

  // Normalizações (funciona nos dois formatos)
  const full = data as IxcClienteFullOut;
  const raw = (full.raw || (data as any).raw) || (data as any).cliente?.raw || {};
  const cli = full.cliente_basic || (data as any).cliente || {};

  const idCliente = full.cliente_id || (data as any).id_cliente || cli.id;
  const statusRad = full.status ?? raw?.ativo ?? (data as any).status;
  const online = String(raw?.online || "").toUpperCase() === "S";

  const ipv4 = raw?.ip || raw?.ip_aviso || "—";
  const mac = raw?.mac || "—";
  const pd_ipv6 = raw?.pd_ipv6 || "—";
  const framed_pd_ipv6 = raw?.framed_pd_ipv6 || "—";
  const concentrador = raw?.concentrador || raw?.id_concentrador || "—";
  const ultimaIni = raw?.ultima_conexao_inicial || raw?.ultima_atualizacao || "—";
  const tempoConect = humanizeSeconds(raw?.tempo_conectado || raw?.tempo_conexao);
  const conexao = raw?.conexao || "—";
  const plano = full.plano || "—";

  return (
    <VStack align="stretch" spacing={4}>
      {/* Cabeçalho + status */}
      <Box bg="gray.900" p={4} rounded="lg" border="1px solid" borderColor="whiteAlpha.200">
        <HStack justify="space-between" align="start">
          <VStack align="start" spacing={1}>
            <HStack spacing={3}>
              <Text fontWeight="bold" fontSize="lg">{cli?.nome || "Cliente"}</Text>
              <Badge colorScheme={statusRad === "S" ? "green" : "gray"}>{statusRad === "S" ? "ATIVO" : "INATIVO"}</Badge>
              <Badge colorScheme={online ? "green" : "gray"}>{online ? "ONLINE" : "OFFLINE"}</Badge>
            </HStack>
            <Text color="gray.300" fontSize="sm">
              <Icon as={FiHash} mr={1} /> ID Cliente: <Code>{idCliente || "—"}</Code>
            </Text>
            <Text color="gray.300" fontSize="sm">
              Login PPPoE: <Code>{data.login}</Code>
            </Text>
          </VStack>
          <VStack align="end" spacing={1}>
            <Badge variant="subtle" colorScheme="purple"><Icon as={FiServer} mr={1} /> Contrato: {full.id_contrato || "—"}</Badge>
            <Badge variant="subtle" colorScheme="blue">Plano: {String(plano || "—")}</Badge>
          </VStack>
        </HStack>

        <Divider my={3} borderColor="whiteAlpha.300" />

        {/* Grid com dados técnicos do radusuarios */}
        <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={3}>
          <Info title="IPv4" value={ipv4} icon={FiGlobe} />
          <Info title="MAC" value={mac} icon={FiCpu} />
          <Info title="Concentrador" value={concentrador} icon={FiServer} />
          <Info title="IPv6 PD" value={pd_ipv6} icon={FiWifi} />
          <Info title="Framed IPv6 PD" value={framed_pd_ipv6} icon={FiWifi} />
          <Info title="Conexão" value={conexao} icon={FiActivity} />
          <Info title="Última conexão" value={ultimaIni} icon={FiClock} />
          <Info title="Tempo conectado" value={tempoConect} icon={FiClock} />
        </SimpleGrid>

        {/* bloco de contato/endereço */}
        <Divider my={3} borderColor="whiteAlpha.300" />
        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
          <Box>
            <Text fontWeight="bold" mb={1}>Contato</Text>
            <Text><b>E-mail:</b> {cli?.email || "—"}</Text>
            <Text><b>Telefone:</b> {cli?.telefone || cli?.celular || "—"}</Text>
            <Text><b>CPF/CNPJ:</b> {cli?.cpf_cnpj || "—"}</Text>
          </Box>
          <Box>
            <Text fontWeight="bold" mb={1}>Endereço</Text>
            <Text>{cli?.endereco || "—"}</Text>
            <Text>{cli?.bairro || "—"} — {cli?.cidade || "—"}{cli?.uf ? ` / ${cli.uf}` : ""}</Text>
          </Box>
        </SimpleGrid>
      </Box>

      {/* Contratos */}
      <Box bg="gray.900" p={4} rounded="lg" border="1px solid" borderColor="whiteAlpha.200">
        <Text fontWeight="bold" mb={2}>Contratos</Text>
        {full.contratos?.length ? (
          <Table size="sm" variant="simple">
            <Thead>
              <Tr>
                <Th color="gray.300">ID</Th>
                <Th color="gray.300">Status</Th>
                <Th color="gray.300">Plano</Th>
                <Th color="gray.300">Descrição</Th>
              </Tr>
            </Thead>
            <Tbody>
              {full.contratos!.map((k, i) => (
                <Tr key={i}>
                  <Td><Code>{k.id || "—"}</Code></Td>
                  <Td><Badge colorScheme={String(k.status||"").match(/ATIVO|A/i) ? "green" : "gray"}>{k.status || "—"}</Badge></Td>
                  <Td>{k.plano || "—"}</Td>
                  <Td>{k.descricao || "—"}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        ) : (
          <Text color="gray.400" fontSize="sm">Sem contratos (id_contrato: <Code>{full.id_contrato || "—"}</Code>).</Text>
        )}
      </Box>

      {/* Cobranças em aberto */}
      <Box bg="gray.900" p={4} rounded="lg" border="1px solid" borderColor="whiteAlpha.200">
        <Text fontWeight="bold" mb={2}>Cobranças em aberto</Text>
        {full.cobrancas_aberto?.length ? (
          <Table size="sm" variant="simple">
            <Thead>
              <Tr>
                <Th color="gray.300">ID</Th>
                <Th color="gray.300">Vencimento</Th>
                <Th color="gray.300">Valor</Th>
                <Th color="gray.300">Status</Th>
              </Tr>
            </Thead>
            <Tbody>
              {full.cobrancas_aberto!.map((cob, i) => (
                <Tr key={i}>
                  <Td><Code>{cob.id || "—"}</Code></Td>
                  <Td>{cob.vencimento || "—"}</Td>
                  <Td>R$ {Number(cob.valor || 0).toFixed(2)}</Td>
                  <Td><Badge colorScheme="red">{cob.status || "ABERTO"}</Badge></Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        ) : (
          <Text color="gray.400" fontSize="sm">Sem cobranças em aberto.</Text>
        )}
      </Box>

      {/* Debug opcional do RAW do radusuarios */}
      {Object.keys(raw).length ? (
        <Box bg="gray.900" p={4} rounded="lg" border="1px solid" borderColor="whiteAlpha.200">
          <HStack justify="space-between" mb={2}>
            <Text fontWeight="bold">radusuarios (RAW)</Text>
            <Badge>campos: {Object.keys(raw).length}</Badge>
          </HStack>
          <Code whiteSpace="pre-wrap" w="full" p={3} display="block">
            {JSON.stringify(raw, null, 2)}
          </Code>
        </Box>
      ) : null}
    </VStack>
  );
}

function Info({ title, value, icon }: { title: string; value: any; icon?: any }) {
  const v = value ?? "—";
  const isEmpty = v === "—" || v === "" || v === undefined || v === null;
  return (
    <Box bg="blackAlpha.500" p={3} rounded="md" border="1px solid" borderColor="whiteAlpha.200">
      <HStack spacing={2} mb={1}>
        {icon ? <Icon as={icon} /> : null}
        <Text fontWeight="bold">{title}</Text>
      </HStack>
      <Tooltip label={String(v)} hasArrow isDisabled={isEmpty}>
        <Text color="gray.200" isTruncated>{String(v)}</Text>
      </Tooltip>
    </Box>
  );
}
