// src/components/ClienteIXCEnhanced.tsx
import {
  Box,
  Text,
  VStack,
  HStack,
  Badge,
  Icon,
  SimpleGrid,
  Stat,
  StatLabel,
  StatNumber,
  Spinner,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Avatar,
  Button,
  useToast,
  Tooltip,
  Alert,
  AlertIcon,
  Tabs,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
} from "@chakra-ui/react";
import { useEffect, useState } from "react";
import {
  FaUser,
  FaPhone,
  FaEnvelope,
  FaMapMarkerAlt,
  FaFileInvoiceDollar,
  FaWifi,
  FaSync,
  FaCheckCircle,
  FaExclamationTriangle,
  FaCalendarAlt,
  FaCreditCard,
  FaNetworkWired,
  FaCopy,
} from "react-icons/fa";
import { getIxcClienteFullByLogin, IxcClienteFullOut } from "../services/genieAcsApi";

interface Props {
  login: string | null;
  deviceId?: string;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function ClienteIXCEnhanced({ login, deviceId: _deviceId }: Props) {
  const toast = useToast();
  const [data, setData] = useState<IxcClienteFullOut | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    if (!login) return;
    setLoading(true);
    setError(null);
    try {
      const result = await getIxcClienteFullByLogin(login);
      setData(result);
      if (!result.found) {
        setError(result.message || "Cliente não encontrado");
      }
    } catch (err: any) {
      setError(err.message || "Erro ao buscar dados");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [login]);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: `${label} copiado!`, status: "success", duration: 2000 });
  };

  const formatCurrency = (value?: string | number) => {
    if (!value) return "—";
    const num = typeof value === "string" ? parseFloat(value) : value;
    return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  };

  const formatDate = (date?: string) => {
    if (!date) return "—";
    try {
      return new Date(date).toLocaleDateString("pt-BR");
    } catch {
      return date;
    }
  };

  const getStatusColor = (status?: string) => {
    if (!status) return "gray";
    const s = status.toLowerCase();
    if (s === "a" || s === "ativo" || s === "s") return "green";
    if (s === "i" || s === "inativo" || s === "n") return "red";
    if (s === "bloqueado" || s === "suspenso") return "orange";
    return "gray";
  };

  const getStatusLabel = (status?: string) => {
    if (!status) return "Desconhecido";
    const s = status.toLowerCase();
    if (s === "a" || s === "s") return "Ativo";
    if (s === "i" || s === "n") return "Inativo";
    return status;
  };

  if (!login) {
    return (
      <Box textAlign="center" py={8}>
        <Icon as={FaUser} boxSize={12} color="gray.500" mb={4} />
        <Text color="gray.400">Login PPPoE não identificado</Text>
        <Text color="gray.500" fontSize="sm">
          Verifique se o dispositivo possui conexão PPPoE configurada
        </Text>
      </Box>
    );
  }

  if (loading) {
    return (
      <Box textAlign="center" py={8}>
        <Spinner size="xl" color="cyan.400" />
        <Text color="gray.400" mt={4}>Buscando dados do cliente...</Text>
      </Box>
    );
  }

  if (error || !data?.found) {
    return (
      <Box>
        <Alert status="warning" borderRadius="lg" mb={4}>
          <AlertIcon />
          <VStack align="start" spacing={0}>
            <Text fontWeight="bold">Cliente não encontrado</Text>
            <Text fontSize="sm">{error || "Verifique a integração com o IXC"}</Text>
          </VStack>
        </Alert>
        <Box textAlign="center" py={4}>
          <Text color="gray.400" mb={2}>Login buscado: <strong>{login}</strong></Text>
          <Button size="sm" leftIcon={<FaSync />} onClick={loadData} colorScheme="cyan" variant="outline">
            Tentar novamente
          </Button>
        </Box>
      </Box>
    );
  }

  const cliente = data.cliente_basic;
  const raw = data.raw;

  return (
    <Box>
      {/* Header do cliente */}
      <HStack spacing={4} mb={6} p={4} bg="gray.700" borderRadius="xl">
        <Avatar
          size="lg"
          name={cliente?.nome || login}
          bg="cyan.600"
        />
        <VStack align="start" spacing={1} flex={1}>
          <HStack>
            <Text fontWeight="bold" fontSize="xl" color="white">
              {cliente?.nome || "Cliente"}
            </Text>
            <Badge colorScheme={getStatusColor(data.status)} fontSize="sm">
              {getStatusLabel(data.status)}
            </Badge>
          </HStack>
          <HStack spacing={4} color="gray.400" fontSize="sm">
            {cliente?.codigo && <Text>Código: {cliente.codigo}</Text>}
            <Text>Login: {login}</Text>
          </HStack>
        </VStack>
        <Button size="sm" leftIcon={<FaSync />} onClick={loadData} variant="ghost" colorScheme="cyan">
          Atualizar
        </Button>
      </HStack>

      <Tabs variant="soft-rounded" colorScheme="cyan" size="sm">
        <TabList mb={4}>
          <Tab>👤 Dados</Tab>
          <Tab>📶 Conexão</Tab>
          <Tab>💰 Financeiro</Tab>
          <Tab>🔧 Raw</Tab>
        </TabList>

        <TabPanels>
          {/* Dados do Cliente */}
          <TabPanel p={0}>
            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
              {/* Info Pessoal */}
              <Box bg="gray.800" p={4} borderRadius="xl" border="1px solid" borderColor="gray.700">
                <Text fontWeight="bold" color="white" mb={4}>
                  <Icon as={FaUser} mr={2} />
                  Informações Pessoais
                </Text>
                <VStack align="stretch" spacing={3}>
                  <HStack justify="space-between">
                    <Text color="gray.400">Nome</Text>
                    <Text color="white" fontWeight="medium">{cliente?.nome || "—"}</Text>
                  </HStack>
                  <HStack justify="space-between">
                    <Text color="gray.400">CPF/CNPJ</Text>
                    <HStack>
                      <Text color="white">{cliente?.cpf_cnpj || "—"}</Text>
                      {cliente?.cpf_cnpj && (
                        <Tooltip label="Copiar">
                          <Button
                            size="xs"
                            variant="ghost"
                            onClick={() => copyToClipboard(cliente.cpf_cnpj!, "CPF/CNPJ")}
                          >
                            <Icon as={FaCopy} />
                          </Button>
                        </Tooltip>
                      )}
                    </HStack>
                  </HStack>
                  <HStack justify="space-between">
                    <Text color="gray.400">Código</Text>
                    <Text color="white">{cliente?.codigo || data.id_cliente || "—"}</Text>
                  </HStack>
                </VStack>
              </Box>

              {/* Contato */}
              <Box bg="gray.800" p={4} borderRadius="xl" border="1px solid" borderColor="gray.700">
                <Text fontWeight="bold" color="white" mb={4}>
                  <Icon as={FaPhone} mr={2} />
                  Contato
                </Text>
                <VStack align="stretch" spacing={3}>
                  <HStack justify="space-between">
                    <HStack color="gray.400">
                      <Icon as={FaPhone} />
                      <Text>Telefone</Text>
                    </HStack>
                    <Text color="white">{cliente?.telefone || "—"}</Text>
                  </HStack>
                  <HStack justify="space-between">
                    <HStack color="gray.400">
                      <Icon as={FaPhone} />
                      <Text>Celular</Text>
                    </HStack>
                    <Text color="white">{cliente?.celular || "—"}</Text>
                  </HStack>
                  <HStack justify="space-between">
                    <HStack color="gray.400">
                      <Icon as={FaEnvelope} />
                      <Text>E-mail</Text>
                    </HStack>
                    <Text color="white" fontSize="sm" noOfLines={1}>
                      {cliente?.email || "—"}
                    </Text>
                  </HStack>
                </VStack>
              </Box>

              {/* Endereço */}
              <Box bg="gray.800" p={4} borderRadius="xl" border="1px solid" borderColor="gray.700" gridColumn={{ md: "span 2" }}>
                <Text fontWeight="bold" color="white" mb={4}>
                  <Icon as={FaMapMarkerAlt} mr={2} />
                  Endereço
                </Text>
                <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
                  <VStack align="start" spacing={1}>
                    <Text color="gray.400" fontSize="sm">Endereço</Text>
                    <Text color="white">{cliente?.endereco || "—"}</Text>
                  </VStack>
                  <VStack align="start" spacing={1}>
                    <Text color="gray.400" fontSize="sm">Bairro</Text>
                    <Text color="white">{cliente?.bairro || "—"}</Text>
                  </VStack>
                  <VStack align="start" spacing={1}>
                    <Text color="gray.400" fontSize="sm">Cidade/UF</Text>
                    <Text color="white">
                      {cliente?.cidade || "—"}{cliente?.uf ? ` / ${cliente.uf}` : ""}
                    </Text>
                  </VStack>
                </SimpleGrid>
              </Box>
            </SimpleGrid>
          </TabPanel>

          {/* Dados da Conexão */}
          <TabPanel p={0}>
            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
              {/* Status da Conexão */}
              <Box bg="gray.800" p={4} borderRadius="xl" border="1px solid" borderColor="gray.700">
                <Text fontWeight="bold" color="white" mb={4}>
                  <Icon as={FaWifi} mr={2} />
                  Status da Conexão
                </Text>
                <VStack align="stretch" spacing={3}>
                  <HStack justify="space-between">
                    <Text color="gray.400">Login PPPoE</Text>
                    <HStack>
                      <Badge colorScheme="blue">{login}</Badge>
                      <Tooltip label="Copiar">
                        <Button size="xs" variant="ghost" onClick={() => copyToClipboard(login, "Login")}>
                          <Icon as={FaCopy} />
                        </Button>
                      </Tooltip>
                    </HStack>
                  </HStack>
                  <HStack justify="space-between">
                    <Text color="gray.400">Status Radius</Text>
                    <Badge colorScheme={getStatusColor(data.status)}>
                      {getStatusLabel(data.status)}
                    </Badge>
                  </HStack>
                  <HStack justify="space-between">
                    <Text color="gray.400">Plano</Text>
                    <Text color="white" fontWeight="medium">{data.plano || "—"}</Text>
                  </HStack>
                  {raw?.ip && (
                    <HStack justify="space-between">
                      <Text color="gray.400">IP Fixo</Text>
                      <Badge colorScheme="green">{raw.ip}</Badge>
                    </HStack>
                  )}
                </VStack>
              </Box>

              {/* Detalhes Técnicos */}
              <Box bg="gray.800" p={4} borderRadius="xl" border="1px solid" borderColor="gray.700">
                <Text fontWeight="bold" color="white" mb={4}>
                  <Icon as={FaNetworkWired} mr={2} />
                  Detalhes Técnicos
                </Text>
                <VStack align="stretch" spacing={3}>
                  {raw?.mac && (
                    <HStack justify="space-between">
                      <Text color="gray.400">MAC</Text>
                      <Badge colorScheme="gray" fontFamily="mono">{raw.mac}</Badge>
                    </HStack>
                  )}
                  {raw?.pd_ipv6 && (
                    <HStack justify="space-between">
                      <Text color="gray.400">IPv6 PD</Text>
                      <Text color="white" fontSize="xs" fontFamily="mono">{raw.pd_ipv6}</Text>
                    </HStack>
                  )}
                  {raw?.id_contrato && (
                    <HStack justify="space-between">
                      <Text color="gray.400">ID Contrato</Text>
                      <Text color="white">{raw.id_contrato}</Text>
                    </HStack>
                  )}
                  {raw?.velocidade && (
                    <HStack justify="space-between">
                      <Text color="gray.400">Velocidade</Text>
                      <Badge colorScheme="purple">{raw.velocidade}</Badge>
                    </HStack>
                  )}
                </VStack>
              </Box>

              {/* Contratos */}
              {data.contratos && data.contratos.length > 0 && (
                <Box bg="gray.800" p={4} borderRadius="xl" border="1px solid" borderColor="gray.700" gridColumn={{ md: "span 2" }}>
                  <Text fontWeight="bold" color="white" mb={4}>
                    <Icon as={FaFileInvoiceDollar} mr={2} />
                    Contratos
                  </Text>
                  <Table size="sm">
                    <Thead>
                      <Tr>
                        <Th color="gray.400">ID</Th>
                        <Th color="gray.400">Plano</Th>
                        <Th color="gray.400">Status</Th>
                        <Th color="gray.400">Login</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {data.contratos.map((c, i) => (
                        <Tr key={i}>
                          <Td><Text color="white">{c.id || "—"}</Text></Td>
                          <Td><Text color="white">{c.plano || c.descricao || "—"}</Text></Td>
                          <Td>
                            <Badge colorScheme={getStatusColor(c.status)}>
                              {getStatusLabel(c.status)}
                            </Badge>
                          </Td>
                          <Td><Badge colorScheme="blue">{c.login || "—"}</Badge></Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                </Box>
              )}
            </SimpleGrid>
          </TabPanel>

          {/* Financeiro */}
          <TabPanel p={0}>
            <Box bg="gray.800" p={4} borderRadius="xl" border="1px solid" borderColor="gray.700">
              <Text fontWeight="bold" color="white" mb={4}>
                <Icon as={FaCreditCard} mr={2} />
                Cobranças em Aberto
              </Text>
              
              {data.cobrancas_aberto && data.cobrancas_aberto.length > 0 ? (
                <>
                  {/* Resumo */}
                  <SimpleGrid columns={{ base: 2, md: 3 }} spacing={4} mb={4}>
                    <Stat bg="gray.700" p={3} borderRadius="lg">
                      <StatLabel color="gray.400">Total em Aberto</StatLabel>
                      <StatNumber color="red.400" fontSize="lg">
                        {formatCurrency(
                          data.cobrancas_aberto.reduce((sum, c) => {
                            const val = typeof c.valor === "string" ? parseFloat(c.valor) : (c.valor || 0);
                            return sum + val;
                          }, 0)
                        )}
                      </StatNumber>
                    </Stat>
                    <Stat bg="gray.700" p={3} borderRadius="lg">
                      <StatLabel color="gray.400">Faturas</StatLabel>
                      <StatNumber color="white" fontSize="lg">
                        {data.cobrancas_aberto.length}
                      </StatNumber>
                    </Stat>
                    <Stat bg="gray.700" p={3} borderRadius="lg">
                      <StatLabel color="gray.400">Próximo Vencimento</StatLabel>
                      <StatNumber color="yellow.400" fontSize="lg">
                        {formatDate(data.cobrancas_aberto[0]?.vencimento)}
                      </StatNumber>
                    </Stat>
                  </SimpleGrid>

                  {/* Lista de cobranças */}
                  <Box overflowX="auto">
                    <Table size="sm">
                      <Thead>
                        <Tr>
                          <Th color="gray.400">Vencimento</Th>
                          <Th color="gray.400">Valor</Th>
                          <Th color="gray.400">Status</Th>
                          <Th color="gray.400">Nosso Número</Th>
                        </Tr>
                      </Thead>
                      <Tbody>
                        {data.cobrancas_aberto.map((cob, i) => {
                          const isOverdue = cob.vencimento && new Date(cob.vencimento) < new Date();
                          return (
                            <Tr key={i}>
                              <Td>
                                <HStack>
                                  <Icon
                                    as={isOverdue ? FaExclamationTriangle : FaCalendarAlt}
                                    color={isOverdue ? "red.400" : "gray.400"}
                                  />
                                  <Text color={isOverdue ? "red.400" : "white"}>
                                    {formatDate(cob.vencimento)}
                                  </Text>
                                </HStack>
                              </Td>
                              <Td>
                                <Text color="white" fontWeight="bold">
                                  {formatCurrency(cob.valor)}
                                </Text>
                              </Td>
                              <Td>
                                <Badge colorScheme={cob.status === "aberto" ? "yellow" : "gray"}>
                                  {cob.status || "Aberto"}
                                </Badge>
                              </Td>
                              <Td>
                                <Text color="gray.400" fontSize="xs" fontFamily="mono">
                                  {cob.nosso_numero || "—"}
                                </Text>
                              </Td>
                            </Tr>
                          );
                        })}
                      </Tbody>
                    </Table>
                  </Box>
                </>
              ) : (
                <Box textAlign="center" py={8}>
                  <Icon as={FaCheckCircle} boxSize={12} color="green.400" mb={4} />
                  <Text color="green.400" fontWeight="bold" fontSize="lg">
                    Nenhuma cobrança em aberto
                  </Text>
                  <Text color="gray.400" fontSize="sm">
                    Cliente em dia com os pagamentos
                  </Text>
                </Box>
              )}
            </Box>
          </TabPanel>
          {/* Raw / debug */}
          <TabPanel p={0}>
            <Box bg="gray.800" p={4} borderRadius="xl" border="1px solid" borderColor="gray.700">
              <Text fontWeight="bold" color="white" mb={4}>
                Dados brutos (IXC)
              </Text>
              <Box as="pre" whiteSpace="pre-wrap" fontSize="12px" overflowX="auto" maxH="400px">
                {JSON.stringify(data, null, 2)}
              </Box>
            </Box>
          </TabPanel>
        </TabPanels>
      </Tabs>
    </Box>
  );
}
