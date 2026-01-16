// src/components/ClienteIXCModal.tsx
// Modal Premium de Cliente IXC com ações rápidas e histórico

import {
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter,
  ModalCloseButton, Button, useToast,
  Box, Text, Badge, HStack, VStack,
  Table, Thead, Tbody, Tr, Th, Td, Code, SimpleGrid,
  Tabs, TabList, TabPanels, Tab, TabPanel,
  IconButton, Tooltip,
  Alert, AlertIcon, Spinner, Skeleton, SkeletonText,
  Menu, MenuButton, MenuList, MenuItem, MenuDivider
} from "@chakra-ui/react";
import { useEffect, useState, useCallback } from "react";
import {
  FiUser, FiPhone, FiMail, FiMapPin, FiDollarSign, FiFileText,
  FiWifi, FiClock, FiServer, FiActivity, FiHash, FiGlobe,
  FiRefreshCw, FiExternalLink, FiCopy, FiMoreVertical,
  FiAlertCircle, FiCheckCircle, FiXCircle
} from "react-icons/fi";
import {
  getIxcClienteFullByLogin,
  humanizeSeconds,
  type IxcClienteFullOut
} from "../services/genieAcsApi";

// ============ Tipos ============
interface ClienteIXCModalProps {
  login: string | null | undefined;
  isOpen: boolean;
  onClose: () => void;
  onClienteLoaded?: (cliente: IxcClienteFullOut) => void;
}

interface ActionLog {
  timestamp: Date;
  action: string;
  status: "success" | "error" | "pending";
  details?: string;
}

// ============ Componente Principal ============
export default function ClienteIXCModal({
  login,
  isOpen,
  onClose,
  onClienteLoaded
}: ClienteIXCModalProps) {
  const toast = useToast();
  
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<IxcClienteFullOut | null>(null);
  const [actionLogs, setActionLogs] = useState<ActionLog[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // ============ Carregar dados do cliente ============
  const loadCliente = useCallback(async () => {
    if (!login) {
      setData(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const result = await getIxcClienteFullByLogin(login);
      setData(result);
      if (result?.found && onClienteLoaded) {
        onClienteLoaded(result);
      }
    } catch (err) {
      console.error("Erro ao carregar cliente IXC:", err);
      toast({
        title: "Erro ao carregar cliente",
        description: String(err),
        status: "error",
        duration: 5000,
        isClosable: true
      });
    } finally {
      setLoading(false);
    }
  }, [login, toast, onClienteLoaded]);

  useEffect(() => {
    if (isOpen) {
      loadCliente();
    }
  }, [isOpen, loadCliente]);

  // ============ Ações rápidas ============
  const handleRefresh = async () => {
    setRefreshing(true);
    await loadCliente();
    setRefreshing(false);
    addActionLog("Dados atualizados", "success");
  };

  const addActionLog = (action: string, status: "success" | "error" | "pending", details?: string) => {
    setActionLogs(prev => [{
      timestamp: new Date(),
      action,
      status,
      details
    }, ...prev.slice(0, 9)]); // Manter últimas 10 ações
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: `${label} copiado!`,
      status: "success",
      duration: 2000,
      isClosable: true
    });
    addActionLog(`Copiado: ${label}`, "success");
  };

  const openIxcUrl = (path: string) => {
    // Placeholder - configurar URL base do IXC
    const baseUrl = "https://ixc.seudominio.com.br";
    window.open(`${baseUrl}${path}`, "_blank");
    addActionLog(`Aberto IXC: ${path}`, "success");
  };

  // ============ Renderização ============
  if (!isOpen) return null;

  const cli = data?.cliente_basic || {};
  const raw = (data as any)?.raw || {};
  const online = String(raw?.online || "").toUpperCase() === "S";
  const statusRad = data?.status ?? raw?.ativo;

  // Calcular totais financeiros
  const totalAberto = data?.cobrancas_aberto?.reduce(
    (acc, cob) => acc + Number(cob.valor || 0), 0
  ) || 0;

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="6xl" scrollBehavior="inside">
      <ModalOverlay bg="blackAlpha.800" backdropFilter="blur(4px)" />
      <ModalContent bg="gray.900" borderColor="whiteAlpha.200" borderWidth="1px" maxH="90vh">
        <ModalHeader borderBottomWidth="1px" borderColor="whiteAlpha.100">
          <HStack justify="space-between" align="center">
            <HStack spacing={3}>
              <Box p={2} bg="blue.600" rounded="lg">
                <FiUser size={20} />
              </Box>
              <VStack align="start" spacing={0}>
                <Text fontSize="lg" fontWeight="bold">
                  {loading ? <Skeleton h="20px" w="200px" /> : (cli?.nome || "Cliente IXC")}
                </Text>
                <HStack spacing={2}>
                  <Code fontSize="xs">{login}</Code>
                  {!loading && (
                    <>
                      <Badge colorScheme={statusRad === "S" ? "green" : "gray"} fontSize="xs">
                        {statusRad === "S" ? "ATIVO" : "INATIVO"}
                      </Badge>
                      <Badge colorScheme={online ? "green" : "red"} fontSize="xs">
                        {online ? "ONLINE" : "OFFLINE"}
                      </Badge>
                    </>
                  )}
                </HStack>
              </VStack>
            </HStack>
            <HStack spacing={2}>
              <Tooltip label="Atualizar dados">
                <IconButton
                  aria-label="Refresh"
                  icon={refreshing ? <Spinner size="sm" /> : <FiRefreshCw />}
                  size="sm"
                  variant="ghost"
                  onClick={handleRefresh}
                  isDisabled={refreshing}
                />
              </Tooltip>
              <Menu>
                <MenuButton
                  as={IconButton}
                  icon={<FiMoreVertical />}
                  size="sm"
                  variant="ghost"
                  aria-label="Mais opções"
                />
                <MenuList bg="gray.800" borderColor="whiteAlpha.200">
                  <MenuItem 
                    icon={<FiExternalLink />} 
                    onClick={() => openIxcUrl(`/admin/clientes/view/${data?.cliente_id}`)}
                    bg="transparent"
                    _hover={{ bg: "whiteAlpha.100" }}
                  >
                    Abrir no IXC
                  </MenuItem>
                  <MenuItem 
                    icon={<FiFileText />} 
                    onClick={() => openIxcUrl(`/admin/contratos/view/${data?.id_contrato}`)}
                    bg="transparent"
                    _hover={{ bg: "whiteAlpha.100" }}
                  >
                    Ver Contrato
                  </MenuItem>
                  <MenuDivider />
                  <MenuItem 
                    icon={<FiCopy />} 
                    onClick={() => copyToClipboard(JSON.stringify(data, null, 2), "JSON Completo")}
                    bg="transparent"
                    _hover={{ bg: "whiteAlpha.100" }}
                  >
                    Copiar JSON
                  </MenuItem>
                </MenuList>
              </Menu>
            </HStack>
          </HStack>
        </ModalHeader>
        <ModalCloseButton />

        <ModalBody py={4}>
          {loading ? (
            <VStack spacing={4}>
              <SkeletonText noOfLines={3} spacing="4" w="full" />
              <SimpleGrid columns={4} spacing={4} w="full">
                {[1,2,3,4].map(i => <Skeleton key={i} h="80px" rounded="lg" />)}
              </SimpleGrid>
              <SkeletonText noOfLines={6} spacing="4" w="full" />
            </VStack>
          ) : !data?.found ? (
            <Alert status="warning" variant="subtle" bg="yellow.900" rounded="lg">
              <AlertIcon />
              <VStack align="start" spacing={1}>
                <Text fontWeight="bold">Cliente não encontrado no IXC</Text>
                <Text fontSize="sm">Login pesquisado: <Code>{login}</Code></Text>
              </VStack>
            </Alert>
          ) : (
            <Tabs variant="soft-rounded" colorScheme="blue" size="sm">
              <TabList mb={4} overflowX="auto" flexWrap="nowrap">
                <Tab><HStack><FiUser /><Text>Dados</Text></HStack></Tab>
                <Tab><HStack><FiWifi /><Text>Conexão</Text></HStack></Tab>
                <Tab><HStack><FiDollarSign /><Text>Financeiro</Text></HStack></Tab>
                <Tab><HStack><FiFileText /><Text>Contratos</Text></HStack></Tab>
                <Tab><HStack><FiActivity /><Text>Ações</Text></HStack></Tab>
              </TabList>

              <TabPanels>
                {/* ============ TAB DADOS ============ */}
                <TabPanel px={0}>
                  <VStack spacing={4} align="stretch">
                    {/* Stats principais */}
                    <SimpleGrid columns={{ base: 2, md: 4 }} spacing={4}>
                      <StatCard
                        label="ID Cliente"
                        value={String(data.cliente_id || "—")}
                        icon={<FiHash />}
                        color="blue"
                        onClick={() => copyToClipboard(String(data.cliente_id), "ID Cliente")}
                      />
                      <StatCard
                        label="Contrato"
                        value={String(data.id_contrato || "—")}
                        icon={<FiFileText />}
                        color="purple"
                        onClick={() => copyToClipboard(String(data.id_contrato), "ID Contrato")}
                      />
                      <StatCard
                        label="Plano"
                        value={String(data.plano || "—")}
                        icon={<FiWifi />}
                        color="green"
                      />
                      <StatCard
                        label="Em Aberto"
                        value={`R$ ${totalAberto.toFixed(2)}`}
                        icon={<FiDollarSign />}
                        color={totalAberto > 0 ? "red" : "green"}
                      />
                    </SimpleGrid>

                    {/* Dados de contato */}
                    <Box bg="gray.800" p={4} rounded="lg" border="1px solid" borderColor="whiteAlpha.200">
                      <Text fontWeight="bold" mb={3}>Informações de Contato</Text>
                      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                        <InfoRow 
                          icon={<FiUser />} 
                          label="Nome" 
                          value={cli?.nome}
                          onCopy={() => copyToClipboard(cli?.nome || "", "Nome")}
                        />
                        <InfoRow 
                          icon={<FiMail />} 
                          label="E-mail" 
                          value={cli?.email}
                          onCopy={() => copyToClipboard(cli?.email || "", "E-mail")}
                        />
                        <InfoRow 
                          icon={<FiPhone />} 
                          label="Telefone" 
                          value={cli?.telefone || cli?.celular}
                          onCopy={() => copyToClipboard(cli?.telefone || cli?.celular || "", "Telefone")}
                        />
                        <InfoRow 
                          icon={<FiHash />} 
                          label="CPF/CNPJ" 
                          value={cli?.cpf_cnpj}
                          onCopy={() => copyToClipboard(cli?.cpf_cnpj || "", "CPF/CNPJ")}
                        />
                      </SimpleGrid>
                    </Box>

                    {/* Endereço */}
                    <Box bg="gray.800" p={4} rounded="lg" border="1px solid" borderColor="whiteAlpha.200">
                      <Text fontWeight="bold" mb={3}>Endereço</Text>
                      <VStack align="stretch" spacing={2}>
                        <HStack>
                          <FiMapPin />
                          <Text>{cli?.endereco || "—"}</Text>
                        </HStack>
                        <Text color="gray.400">
                          {cli?.bairro || "—"} — {cli?.cidade || "—"}{cli?.uf ? ` / ${cli.uf}` : ""}
                        </Text>
                      </VStack>
                    </Box>
                  </VStack>
                </TabPanel>

                {/* ============ TAB CONEXÃO ============ */}
                <TabPanel px={0}>
                  <VStack spacing={4} align="stretch">
                    <SimpleGrid columns={{ base: 2, md: 3 }} spacing={4}>
                      <InfoBox
                        icon={<FiGlobe />}
                        title="IPv4"
                        value={raw?.ip || raw?.ip_aviso || "—"}
                        onCopy={() => copyToClipboard(raw?.ip || "", "IPv4")}
                      />
                      <InfoBox
                        icon={<FiServer />}
                        title="MAC"
                        value={raw?.mac || "—"}
                        onCopy={() => copyToClipboard(raw?.mac || "", "MAC")}
                      />
                      <InfoBox
                        icon={<FiServer />}
                        title="Concentrador"
                        value={raw?.concentrador || raw?.id_concentrador || "—"}
                      />
                      <InfoBox
                        icon={<FiWifi />}
                        title="IPv6 PD"
                        value={raw?.pd_ipv6 || "—"}
                        onCopy={() => copyToClipboard(raw?.pd_ipv6 || "", "IPv6 PD")}
                      />
                      <InfoBox
                        icon={<FiWifi />}
                        title="Framed IPv6"
                        value={raw?.framed_pd_ipv6 || "—"}
                        onCopy={() => copyToClipboard(raw?.framed_pd_ipv6 || "", "Framed IPv6")}
                      />
                      <InfoBox
                        icon={<FiActivity />}
                        title="Conexão"
                        value={raw?.conexao || "—"}
                      />
                    </SimpleGrid>

                    <Box bg="gray.800" p={4} rounded="lg" border="1px solid" borderColor="whiteAlpha.200">
                      <Text fontWeight="bold" mb={3}>Tempo de Conexão</Text>
                      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                        <InfoRow
                          icon={<FiClock />}
                          label="Última Conexão"
                          value={raw?.ultima_conexao_inicial || raw?.ultima_atualizacao || "—"}
                        />
                        <InfoRow
                          icon={<FiClock />}
                          label="Tempo Conectado"
                          value={humanizeSeconds(raw?.tempo_conectado || raw?.tempo_conexao)}
                        />
                      </SimpleGrid>
                    </Box>

                    {/* Status visual */}
                    <Box bg="gray.800" p={4} rounded="lg" border="1px solid" borderColor="whiteAlpha.200">
                      <Text fontWeight="bold" mb={3}>Status da Conexão</Text>
                      <HStack spacing={4}>
                        <Badge 
                          colorScheme={online ? "green" : "red"} 
                          fontSize="md" 
                          p={2} 
                          rounded="md"
                        >
                          {online ? "🟢 ONLINE" : "🔴 OFFLINE"}
                        </Badge>
                        <Badge 
                          colorScheme={statusRad === "S" ? "green" : "gray"} 
                          fontSize="md" 
                          p={2} 
                          rounded="md"
                        >
                          {statusRad === "S" ? "✓ Ativo" : "✗ Inativo"}
                        </Badge>
                      </HStack>
                    </Box>
                  </VStack>
                </TabPanel>

                {/* ============ TAB FINANCEIRO ============ */}
                <TabPanel px={0}>
                  <VStack spacing={4} align="stretch">
                    {/* Resumo financeiro */}
                    <SimpleGrid columns={{ base: 2, md: 3 }} spacing={4}>
                      <StatCard
                        label="Total em Aberto"
                        value={`R$ ${totalAberto.toFixed(2)}`}
                        icon={<FiDollarSign />}
                        color={totalAberto > 0 ? "red" : "green"}
                      />
                      <StatCard
                        label="Faturas Abertas"
                        value={String(data.cobrancas_aberto?.length || 0)}
                        icon={<FiFileText />}
                        color="orange"
                      />
                      <StatCard
                        label="Status Financeiro"
                        value={totalAberto > 0 ? "PENDENTE" : "OK"}
                        icon={totalAberto > 0 ? <FiAlertCircle /> : <FiCheckCircle />}
                        color={totalAberto > 0 ? "red" : "green"}
                      />
                    </SimpleGrid>

                    {/* Lista de cobranças */}
                    <Box bg="gray.800" p={4} rounded="lg" border="1px solid" borderColor="whiteAlpha.200">
                      <Text fontWeight="bold" mb={3}>Cobranças em Aberto</Text>
                      {data.cobrancas_aberto?.length ? (
                        <Box overflowX="auto">
                          <Table size="sm" variant="simple">
                            <Thead>
                              <Tr>
                                <Th color="gray.300">ID</Th>
                                <Th color="gray.300">Vencimento</Th>
                                <Th color="gray.300">Valor</Th>
                                <Th color="gray.300">Status</Th>
                                <Th color="gray.300">Ações</Th>
                              </Tr>
                            </Thead>
                            <Tbody>
                              {data.cobrancas_aberto.map((cob, i) => (
                                <Tr key={i}>
                                  <Td><Code>{cob.id || "—"}</Code></Td>
                                  <Td>{cob.vencimento || "—"}</Td>
                                  <Td fontWeight="bold" color="red.300">
                                    R$ {Number(cob.valor || 0).toFixed(2)}
                                  </Td>
                                  <Td>
                                    <Badge colorScheme="red">{cob.status || "ABERTO"}</Badge>
                                  </Td>
                                  <Td>
                                    <Tooltip label="Abrir no IXC">
                                      <IconButton
                                        aria-label="Abrir"
                                        icon={<FiExternalLink />}
                                        size="xs"
                                        variant="ghost"
                                        onClick={() => openIxcUrl(`/admin/financeiro/view/${cob.id}`)}
                                      />
                                    </Tooltip>
                                  </Td>
                                </Tr>
                              ))}
                            </Tbody>
                          </Table>
                        </Box>
                      ) : (
                        <Alert status="success" variant="subtle" bg="green.900" rounded="md">
                          <AlertIcon />
                          <Text>Nenhuma cobrança em aberto! 🎉</Text>
                        </Alert>
                      )}
                    </Box>
                  </VStack>
                </TabPanel>

                {/* ============ TAB CONTRATOS ============ */}
                <TabPanel px={0}>
                  <VStack spacing={4} align="stretch">
                    <Box bg="gray.800" p={4} rounded="lg" border="1px solid" borderColor="whiteAlpha.200">
                      <Text fontWeight="bold" mb={3}>Contratos do Cliente</Text>
                      {data.contratos?.length ? (
                        <Box overflowX="auto">
                          <Table size="sm" variant="simple">
                            <Thead>
                              <Tr>
                                <Th color="gray.300">ID</Th>
                                <Th color="gray.300">Status</Th>
                                <Th color="gray.300">Plano</Th>
                                <Th color="gray.300">Descrição</Th>
                                <Th color="gray.300">Ações</Th>
                              </Tr>
                            </Thead>
                            <Tbody>
                              {data.contratos.map((k, i) => (
                                <Tr key={i}>
                                  <Td><Code>{k.id || "—"}</Code></Td>
                                  <Td>
                                    <Badge colorScheme={
                                      String(k.status || "").match(/ATIVO|A/i) ? "green" : "gray"
                                    }>
                                      {k.status || "—"}
                                    </Badge>
                                  </Td>
                                  <Td>{k.plano || "—"}</Td>
                                  <Td>{k.descricao || "—"}</Td>
                                  <Td>
                                    <Tooltip label="Abrir no IXC">
                                      <IconButton
                                        aria-label="Abrir"
                                        icon={<FiExternalLink />}
                                        size="xs"
                                        variant="ghost"
                                        onClick={() => openIxcUrl(`/admin/contratos/view/${k.id}`)}
                                      />
                                    </Tooltip>
                                  </Td>
                                </Tr>
                              ))}
                            </Tbody>
                          </Table>
                        </Box>
                      ) : (
                        <Text color="gray.400" fontSize="sm">
                          Nenhum contrato encontrado (id_contrato: <Code>{data.id_contrato || "—"}</Code>)
                        </Text>
                      )}
                    </Box>
                  </VStack>
                </TabPanel>

                {/* ============ TAB AÇÕES ============ */}
                <TabPanel px={0}>
                  <VStack spacing={4} align="stretch">
                    {/* Ações rápidas */}
                    <Box bg="gray.800" p={4} rounded="lg" border="1px solid" borderColor="whiteAlpha.200">
                      <Text fontWeight="bold" mb={3}>Ações Rápidas</Text>
                      <SimpleGrid columns={{ base: 2, md: 4 }} spacing={3}>
                        <Button
                          leftIcon={<FiRefreshCw />}
                          size="sm"
                          colorScheme="blue"
                          variant="outline"
                          onClick={handleRefresh}
                          isLoading={refreshing}
                        >
                          Atualizar Dados
                        </Button>
                        <Button
                          leftIcon={<FiExternalLink />}
                          size="sm"
                          colorScheme="purple"
                          variant="outline"
                          onClick={() => openIxcUrl(`/admin/clientes/view/${data.cliente_id}`)}
                        >
                          Abrir no IXC
                        </Button>
                        <Button
                          leftIcon={<FiCopy />}
                          size="sm"
                          colorScheme="green"
                          variant="outline"
                          onClick={() => copyToClipboard(login || "", "Login")}
                        >
                          Copiar Login
                        </Button>
                        <Button
                          leftIcon={<FiCopy />}
                          size="sm"
                          colorScheme="orange"
                          variant="outline"
                          onClick={() => copyToClipboard(raw?.ip || "", "IP")}
                        >
                          Copiar IP
                        </Button>
                      </SimpleGrid>
                    </Box>

                    {/* Histórico de ações */}
                    <Box bg="gray.800" p={4} rounded="lg" border="1px solid" borderColor="whiteAlpha.200">
                      <Text fontWeight="bold" mb={3}>Histórico de Ações (sessão)</Text>
                      {actionLogs.length > 0 ? (
                        <VStack align="stretch" spacing={2}>
                          {actionLogs.map((log, i) => (
                            <HStack 
                              key={i} 
                              p={2} 
                              bg="blackAlpha.400" 
                              rounded="md"
                              borderLeft="3px solid"
                              borderColor={
                                log.status === "success" ? "green.400" :
                                log.status === "error" ? "red.400" : "yellow.400"
                              }
                            >
                              {log.status === "success" && <FiCheckCircle color="green" />}
                              {log.status === "error" && <FiXCircle color="red" />}
                              {log.status === "pending" && <Spinner size="xs" />}
                              <Text flex={1} fontSize="sm">{log.action}</Text>
                              <Text fontSize="xs" color="gray.500">
                                {log.timestamp.toLocaleTimeString()}
                              </Text>
                            </HStack>
                          ))}
                        </VStack>
                      ) : (
                        <Text color="gray.400" fontSize="sm">
                          Nenhuma ação realizada ainda nesta sessão.
                        </Text>
                      )}
                    </Box>

                    {/* Debug RAW */}
                    {Object.keys(raw).length > 0 && (
                      <Box bg="gray.800" p={4} rounded="lg" border="1px solid" borderColor="whiteAlpha.200">
                        <HStack justify="space-between" mb={2}>
                          <Text fontWeight="bold">Dados RAW (radusuarios)</Text>
                          <Badge>{Object.keys(raw).length} campos</Badge>
                        </HStack>
                        <Box 
                          maxH="200px" 
                          overflowY="auto" 
                          bg="blackAlpha.500" 
                          p={3} 
                          rounded="md"
                        >
                          <Code whiteSpace="pre-wrap" fontSize="xs" display="block">
                            {JSON.stringify(raw, null, 2)}
                          </Code>
                        </Box>
                      </Box>
                    )}
                  </VStack>
                </TabPanel>
              </TabPanels>
            </Tabs>
          )}
        </ModalBody>

        <ModalFooter borderTopWidth="1px" borderColor="whiteAlpha.100">
          <HStack spacing={3}>
            <Button variant="ghost" onClick={onClose}>
              Fechar
            </Button>
            {data?.found && (
              <Button
                colorScheme="blue"
                leftIcon={<FiExternalLink />}
                onClick={() => openIxcUrl(`/admin/clientes/view/${data.cliente_id}`)}
              >
                Abrir no IXC
              </Button>
            )}
          </HStack>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

// ============ Componentes auxiliares ============
function StatCard({ 
  label, value, icon, color, onClick 
}: { 
  label: string; 
  value: string; 
  icon: React.ReactNode;
  color: string;
  onClick?: () => void;
}) {
  return (
    <Box
      bg="gray.800"
      p={4}
      rounded="lg"
      border="1px solid"
      borderColor="whiteAlpha.200"
      cursor={onClick ? "pointer" : "default"}
      onClick={onClick}
      transition="all 0.2s"
      _hover={onClick ? { bg: "gray.700", transform: "translateY(-2px)" } : {}}
    >
      <HStack justify="space-between" mb={2}>
        <Text fontSize="xs" color="gray.400" textTransform="uppercase">
          {label}
        </Text>
        <Box color={`${color}.400`}>{icon}</Box>
      </HStack>
      <Text fontSize="xl" fontWeight="bold" color={`${color}.300`}>
        {value}
      </Text>
    </Box>
  );
}

function InfoBox({ 
  icon, title, value, onCopy 
}: { 
  icon: React.ReactNode; 
  title: string; 
  value: string;
  onCopy?: () => void;
}) {
  return (
    <Box
      bg="gray.800"
      p={4}
      rounded="lg"
      border="1px solid"
      borderColor="whiteAlpha.200"
    >
      <HStack mb={2} color="gray.400">
        {icon}
        <Text fontSize="xs" textTransform="uppercase">{title}</Text>
        {onCopy && (
          <Tooltip label="Copiar">
            <IconButton
              aria-label="Copiar"
              icon={<FiCopy />}
              size="xs"
              variant="ghost"
              ml="auto"
              onClick={(e) => {
                e.stopPropagation();
                onCopy();
              }}
            />
          </Tooltip>
        )}
      </HStack>
      <Tooltip label={value} hasArrow isDisabled={!value || value === "—"}>
        <Text fontWeight="medium" isTruncated>{value || "—"}</Text>
      </Tooltip>
    </Box>
  );
}

function InfoRow({ 
  icon, label, value, onCopy 
}: { 
  icon: React.ReactNode; 
  label: string; 
  value?: string | null;
  onCopy?: () => void;
}) {
  const displayValue = value || "—";
  return (
    <HStack 
      p={3} 
      bg="blackAlpha.400" 
      rounded="md"
      justify="space-between"
    >
      <HStack spacing={3}>
        <Box color="gray.400">{icon}</Box>
        <VStack align="start" spacing={0}>
          <Text fontSize="xs" color="gray.500" textTransform="uppercase">
            {label}
          </Text>
          <Text fontWeight="medium">{displayValue}</Text>
        </VStack>
      </HStack>
      {onCopy && displayValue !== "—" && (
        <Tooltip label="Copiar">
          <IconButton
            aria-label="Copiar"
            icon={<FiCopy />}
            size="xs"
            variant="ghost"
            onClick={onCopy}
          />
        </Tooltip>
      )}
    </HStack>
  );
}
