// components/ParametersEditor.tsx
// Editor completo de parâmetros TR-069 com busca, edição e templates

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Box,
  Card,
  CardBody,
  Text,
  Badge,
  Flex,
  Grid,
  Spinner,
  Input,
  InputGroup,
  InputLeftElement,
  Button,
  IconButton,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Icon,
  Stat,
  StatLabel,
  StatNumber,
  Alert,
  AlertIcon,
  VStack,
  HStack,
  useColorModeValue,
  Tooltip,
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionPanel,
  AccordionIcon,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  useDisclosure,
  useToast,
  Switch,
  Select,
  Divider,
  Tag,
  TagLabel,
} from '@chakra-ui/react';
import {
  FiSearch,
  FiEdit2,
  FiSave,
  FiRefreshCw,
  FiDownload,
  FiUpload,
  FiSettings,
  FiWifi,
  FiGlobe,
  FiServer,
  FiCpu,
  FiDatabase,
  FiFilter,
  FiLock,
  FiUnlock,
  FiCopy,
  FiPlay,
} from 'react-icons/fi';
import { deviceApi } from '../services/apiConfig';

// Interfaces
interface ParameterInfo {
  value: any;
  type: string;
  writable: boolean;
  timestamp: string;
}

interface CategorizedParams {
  device_id: string;
  categories: Record<string, Record<string, ParameterInfo>>;
  total_categories: number;
  fetched_at: string;
}

interface Template {
  name: string;
  description: string;
  category: string;
}

interface Props {
  deviceId: string;
}

// Ícones por categoria
const categoryIcons: Record<string, any> = {
  DeviceInfo: FiCpu,
  WANDevice: FiGlobe,
  LANDevice: FiWifi,
  ManagementServer: FiServer,
  Time: FiRefreshCw,
  Layer2Bridging: FiDatabase,
  IPPingDiagnostics: FiRefreshCw,
  DownloadDiagnostics: FiDownload,
  UploadDiagnostics: FiUpload,
  Capabilities: FiSettings,
  X_TP_: FiSettings,
};

const ParametersEditor: React.FC<Props> = ({ deviceId }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categorizedParams, setCategorizedParams] = useState<CategorizedParams | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showWritableOnly, setShowWritableOnly] = useState(false);

  const { isOpen: isEditOpen, onOpen: onEditOpen, onClose: onEditClose } = useDisclosure();
  const { isOpen: isTemplateOpen, onOpen: onTemplateOpen, onClose: onTemplateClose } = useDisclosure();
  const [selectedParam, setSelectedParam] = useState<{ path: string; info: ParameterInfo } | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  const toast = useToast();
  const cardBg = useColorModeValue('white', 'gray.800');
  const tableBg = useColorModeValue('gray.50', 'gray.700');
  const borderColor = useColorModeValue('gray.200', 'gray.600');

  // Fetch data
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [paramsRes, templatesRes] = await Promise.all([
        fetch(deviceApi(deviceId, '/parameters/by-category')),
        fetch(deviceApi(deviceId, '/parameters/template/list'))
      ]);

      if (!paramsRes.ok) throw new Error('Erro ao buscar parâmetros');

      setCategorizedParams(await paramsRes.json());
      if (templatesRes.ok) {
        const tData = await templatesRes.json();
        setTemplates(tData.templates || []);
      }
    } catch (err: any) {
      setError(err.message || 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }, [deviceId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Filtrar parâmetros
  const filteredCategories = useMemo(() => {
    if (!categorizedParams) return {};

    const result: Record<string, Record<string, ParameterInfo>> = {};

    Object.entries(categorizedParams.categories).forEach(([category, params]) => {
      const filtered: Record<string, ParameterInfo> = {};

      Object.entries(params).forEach(([path, info]) => {
        // Filtro por texto
        if (searchQuery && !path.toLowerCase().includes(searchQuery.toLowerCase())) {
          return;
        }
        // Filtro por editável
        if (showWritableOnly && !info.writable) {
          return;
        }
        filtered[path] = info;
      });

      if (Object.keys(filtered).length > 0) {
        result[category] = filtered;
      }
    });

    return result;
  }, [categorizedParams, searchQuery, showWritableOnly]);

  // Abrir modal de edição
  const handleEdit = (path: string, info: ParameterInfo) => {
    setSelectedParam({ path, info });
    setEditValue(String(info.value ?? ''));
    onEditOpen();
  };

  // Salvar parâmetro individual
  const handleSaveParam = async () => {
    if (!selectedParam) return;

    setSaving(true);
    const url = deviceApi(deviceId, '/parameters/set');
    const body = {
      parameters: {
        [selectedParam.path]: parseValue(editValue, selectedParam.info.type)
      },
      auto_refresh: true
    };
    
    console.log('[ParametersEditor] Salvando parâmetro:');
    console.log('[ParametersEditor] URL:', url);
    console.log('[ParametersEditor] Body:', JSON.stringify(body));
    
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      console.log('[ParametersEditor] Response status:', res.status);
      
      if (!res.ok) {
        const errorText = await res.text();
        console.error('[ParametersEditor] Error response:', errorText);
        throw new Error(`Erro ao salvar parâmetro: ${res.status}`);
      }

      const result = await res.json();
      console.log('[ParametersEditor] Result:', result);
      
      toast({
        title: result.success ? 'Parâmetro salvo!' : 'Erro ao salvar',
        description: result.success 
          ? `${selectedParam.path.split('.').pop()} atualizado com sucesso`
          : 'Verifique se o dispositivo está online',
        status: result.success ? 'success' : 'warning',
        duration: 3000,
        isClosable: true,
      });

      if (result.success) {
        onEditClose();
        // Refresh após 2s para dar tempo do dispositivo atualizar
        setTimeout(fetchData, 2000);
      }
    } catch (err: any) {
      toast({
        title: 'Erro',
        description: err.message,
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setSaving(false);
    }
  };

  // Aplicar template
  const handleApplyTemplate = async (templateName: string) => {
    setSaving(true);
    try {
      const res = await fetch(deviceApi(deviceId, '/parameters/template/apply'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template_name: templateName })
      });

      if (!res.ok) throw new Error('Erro ao aplicar template');

      const result = await res.json();
      
      toast({
        title: result.success ? 'Template aplicado!' : 'Erro ao aplicar',
        description: result.success 
          ? `Template "${templateName}" aplicado com sucesso`
          : 'Verifique se o dispositivo está online',
        status: result.success ? 'success' : 'warning',
        duration: 3000,
        isClosable: true,
      });

      if (result.success) {
        onTemplateClose();
        setTimeout(fetchData, 2000);
      }
    } catch (err: any) {
      toast({
        title: 'Erro',
        description: err.message,
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setSaving(false);
    }
  };

  // Fazer backup
  const handleBackup = async () => {
    try {
      const res = await fetch(deviceApi(deviceId, '/parameters/backup'));
      if (!res.ok) throw new Error('Erro ao criar backup');

      const backup = await res.json();
      
      // Download do arquivo
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup_${deviceId}_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);

      toast({
        title: 'Backup criado!',
        description: `${backup.parameters_count} parâmetros exportados`,
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
    } catch (err: any) {
      toast({
        title: 'Erro no backup',
        description: err.message,
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    }
  };

  // Parse valor pelo tipo
  const parseValue = (value: string, type: string): any => {
    if (type.includes('boolean')) {
      return value.toLowerCase() === 'true' || value === '1';
    }
    if (type.includes('int') || type.includes('unsignedInt')) {
      return parseInt(value, 10);
    }
    if (type.includes('double') || type.includes('float')) {
      return parseFloat(value);
    }
    return value;
  };

  // Formatar valor para exibição
  const formatValue = (value: any): string => {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'boolean') return value ? 'True' : 'False';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  // Estatísticas
  const stats = useMemo(() => {
    if (!categorizedParams) return { total: 0, writable: 0, categories: 0 };
    
    let total = 0;
    let writable = 0;
    
    Object.values(categorizedParams.categories).forEach(params => {
      Object.values(params).forEach(info => {
        total++;
        if (info.writable) writable++;
      });
    });
    
    return {
      total,
      writable,
      categories: categorizedParams.total_categories
    };
  }, [categorizedParams]);

  if (loading) {
    return (
      <Flex justify="center" align="center" h="400px">
        <Spinner size="xl" color="blue.500" thickness="4px" />
      </Flex>
    );
  }

  if (error) {
    return (
      <Alert status="error" borderRadius="lg">
        <AlertIcon />
        {error}
      </Alert>
    );
  }

  return (
    <VStack spacing={4} align="stretch">
      {/* Header com stats */}
      <Card bg={cardBg}>
        <CardBody>
          <Grid templateColumns={{ base: '1fr', md: 'repeat(4, 1fr)' }} gap={4}>
            <Stat>
              <StatLabel>Total de Parâmetros</StatLabel>
              <StatNumber color="blue.500">{stats.total}</StatNumber>
            </Stat>
            <Stat>
              <StatLabel>Parâmetros Editáveis</StatLabel>
              <StatNumber color="green.500">{stats.writable}</StatNumber>
            </Stat>
            <Stat>
              <StatLabel>Categorias</StatLabel>
              <StatNumber color="purple.500">{stats.categories}</StatNumber>
            </Stat>
            <Flex align="center" justify="flex-end" gap={2}>
              <Tooltip label="Fazer backup dos parâmetros">
                <IconButton
                  aria-label="Backup"
                  icon={<FiDownload />}
                  onClick={handleBackup}
                  colorScheme="blue"
                  variant="outline"
                />
              </Tooltip>
              <Tooltip label="Aplicar template">
                <IconButton
                  aria-label="Templates"
                  icon={<FiPlay />}
                  onClick={onTemplateOpen}
                  colorScheme="purple"
                  variant="outline"
                />
              </Tooltip>
              <Tooltip label="Atualizar">
                <IconButton
                  aria-label="Refresh"
                  icon={<FiRefreshCw />}
                  onClick={fetchData}
                  colorScheme="teal"
                  variant="outline"
                />
              </Tooltip>
            </Flex>
          </Grid>
        </CardBody>
      </Card>

      {/* Filtros */}
      <Card bg={cardBg}>
        <CardBody>
          <HStack spacing={4} flexWrap="wrap">
            <InputGroup maxW="400px">
              <InputLeftElement pointerEvents="none">
                <Icon as={FiSearch} color="gray.400" />
              </InputLeftElement>
              <Input
                placeholder="Buscar parâmetro... (ex: SSID, WAN, DHCP)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </InputGroup>
            <HStack>
              <Icon as={showWritableOnly ? FiUnlock : FiFilter} color="gray.500" />
              <Text fontSize="sm">Apenas editáveis</Text>
              <Switch
                isChecked={showWritableOnly}
                onChange={(e) => setShowWritableOnly(e.target.checked)}
                colorScheme="green"
              />
            </HStack>
            {searchQuery && (
              <Tag colorScheme="blue">
                <TagLabel>
                  {Object.values(filteredCategories).reduce((sum, cat) => sum + Object.keys(cat).length, 0)} resultados
                </TagLabel>
              </Tag>
            )}
          </HStack>
        </CardBody>
      </Card>

      {/* Lista de parâmetros por categoria */}
      <Accordion allowMultiple defaultIndex={[0]}>
        {Object.entries(filteredCategories).map(([category, params]) => {
          const CategoryIcon = categoryIcons[category] || FiSettings;
          const paramCount = Object.keys(params).length;
          const writableCount = Object.values(params).filter(p => p.writable).length;

          return (
            <AccordionItem key={category} border="1px" borderColor={borderColor} borderRadius="lg" mb={2}>
              <h2>
                <AccordionButton _expanded={{ bg: tableBg }}>
                  <HStack flex="1" textAlign="left">
                    <Icon as={CategoryIcon} color="blue.500" />
                    <Text fontWeight="bold">{category}</Text>
                    <Badge colorScheme="blue">{paramCount}</Badge>
                    {writableCount > 0 && (
                      <Badge colorScheme="green" ml={1}>
                        {writableCount} editáveis
                      </Badge>
                    )}
                  </HStack>
                  <AccordionIcon />
                </AccordionButton>
              </h2>
              <AccordionPanel pb={4} bg={cardBg}>
                <Box overflowX="auto">
                  <Table size="sm" variant="simple">
                    <Thead>
                      <Tr>
                        <Th>Parâmetro</Th>
                        <Th>Valor</Th>
                        <Th>Tipo</Th>
                        <Th isNumeric>Ação</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {Object.entries(params).map(([path, info]) => {
                        // Extrair nome amigável do path (último segmento) e um nome curto
                        const parts = path.split('.');
                        const last = parts[parts.length - 1] || parts.slice(-2).join('.');
                        const shortName = parts.slice(-2).join('.');
                        // Gerar label legível: separar camelCase/underscores e capitalizar
                        const displayName = last
                          .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
                          .replace(/[_\-]/g, ' ')
                          .replace(/\s+/g, ' ')
                          .trim()
                          .replace(/(^|\s)\S/g, (t) => t.toUpperCase());

                        return (
                          <Tr key={path} _hover={{ bg: tableBg }}>
                            <Td>
                              <Tooltip label={path} hasArrow placement="top-start">
                                <HStack align="start">
                                  <Icon 
                                    as={info.writable ? FiUnlock : FiLock} 
                                    color={info.writable ? 'green.500' : 'gray.400'}
                                    boxSize={3}
                                  />
                                  <Box>
                                    <Text fontSize="sm" fontWeight="semibold" noOfLines={1} maxW="300px">
                                      {displayName}
                                    </Text>
                                    <Text fontSize="xs" color="gray.400" noOfLines={1} maxW="300px">
                                      {shortName}
                                    </Text>
                                  </Box>
                                </HStack>
                              </Tooltip>
                            </Td>
                            <Td>
                              <Text 
                                fontSize="sm" 
                                color={info.value ? 'inherit' : 'gray.400'}
                                noOfLines={1}
                                maxW="200px"
                              >
                                {formatValue(info.value)}
                              </Text>
                            </Td>
                            <Td>
                              <Badge 
                                size="sm" 
                                colorScheme={info.type.includes('boolean') ? 'purple' : 
                                             info.type.includes('int') ? 'blue' : 'gray'}
                                variant="subtle"
                              >
                                {info.type.replace('xsd:', '')}
                              </Badge>
                            </Td>
                            <Td isNumeric>
                              <HStack justify="flex-end" spacing={1}>
                                <Tooltip label="Copiar path">
                                  <IconButton
                                    aria-label="Copy"
                                    icon={<FiCopy />}
                                    size="xs"
                                    variant="ghost"
                                    onClick={() => {
                                      navigator.clipboard.writeText(path);
                                      toast({
                                        title: 'Path copiado!',
                                        status: 'info',
                                        duration: 1500,
                                      });
                                    }}
                                  />
                                </Tooltip>
                                {info.writable && (
                                  <Tooltip label="Editar">
                                    <IconButton
                                      aria-label="Edit"
                                      icon={<FiEdit2 />}
                                      size="xs"
                                      colorScheme="blue"
                                      variant="ghost"
                                      onClick={() => handleEdit(path, info)}
                                    />
                                  </Tooltip>
                                )}
                              </HStack>
                            </Td>
                          </Tr>
                        );
                      })}
                    </Tbody>
                  </Table>
                </Box>
              </AccordionPanel>
            </AccordionItem>
          );
        })}
      </Accordion>

      {Object.keys(filteredCategories).length === 0 && (
        <Alert status="info" borderRadius="lg">
          <AlertIcon />
          Nenhum parâmetro encontrado com os filtros atuais.
        </Alert>
      )}

      {/* Modal de Edição */}
      <Modal isOpen={isEditOpen} onClose={onEditClose} size="lg">
        <ModalOverlay />
        <ModalContent bg={cardBg}>
          <ModalHeader>
            <HStack>
              <Icon as={FiEdit2} color="blue.500" />
              <Text>Editar Parâmetro</Text>
            </HStack>
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            {selectedParam && (
              <VStack spacing={4} align="stretch">
                <Box>
                  <Text fontSize="sm" color="gray.500" mb={1}>Path completo:</Text>
                  <Text fontSize="xs" fontFamily="mono" bg={tableBg} p={2} borderRadius="md">
                    {selectedParam.path}
                  </Text>
                </Box>
                <Box>
                  <Text fontSize="sm" color="gray.500" mb={1}>Tipo:</Text>
                  <Badge colorScheme="blue">{selectedParam.info.type}</Badge>
                </Box>
                <Box>
                  <Text fontSize="sm" color="gray.500" mb={1}>Valor atual:</Text>
                  <Text fontFamily="mono">{formatValue(selectedParam.info.value)}</Text>
                </Box>
                <Divider />
                <Box>
                  <Text fontSize="sm" color="gray.500" mb={1}>Novo valor:</Text>
                  {selectedParam.info.type.includes('boolean') ? (
                    <Select 
                      value={editValue} 
                      onChange={(e) => setEditValue(e.target.value)}
                    >
                      <option value="true">True</option>
                      <option value="false">False</option>
                    </Select>
                  ) : (
                    <Input
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      placeholder="Digite o novo valor..."
                      type={selectedParam.info.type.includes('int') ? 'number' : 'text'}
                    />
                  )}
                </Box>
                <Alert status="warning" size="sm">
                  <AlertIcon />
                  <Text fontSize="xs">
                    A alteração será enviada via TR-069 SetParameterValues.
                    O dispositivo precisa estar online.
                  </Text>
                </Alert>
              </VStack>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={onEditClose}>
              Cancelar
            </Button>
            <Button 
              colorScheme="blue" 
              onClick={handleSaveParam}
              isLoading={saving}
              leftIcon={<FiSave />}
            >
              Salvar
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Modal de Templates */}
      <Modal isOpen={isTemplateOpen} onClose={onTemplateClose}>
        <ModalOverlay />
        <ModalContent bg={cardBg}>
          <ModalHeader>
            <HStack>
              <Icon as={FiPlay} color="purple.500" />
              <Text>Aplicar Template</Text>
            </HStack>
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={3} align="stretch">
              <Text fontSize="sm" color="gray.500">
                Templates são conjuntos de configurações pré-definidas que podem ser aplicadas
                de uma vez só no dispositivo.
              </Text>
              <Divider />
              {templates.map((template) => (
                <Box
                  key={template.name}
                  p={4}
                  borderWidth="1px"
                  borderRadius="md"
                  borderColor={borderColor}
                  _hover={{ bg: tableBg, cursor: 'pointer' }}
                  onClick={() => handleApplyTemplate(template.name)}
                >
                  <HStack justify="space-between">
                    <VStack align="start" spacing={1}>
                      <HStack>
                        <Text fontWeight="bold">{template.name}</Text>
                        <Badge colorScheme="purple" size="sm">{template.category}</Badge>
                      </HStack>
                      <Text fontSize="sm" color="gray.500">{template.description}</Text>
                    </VStack>
                    <IconButton
                      aria-label="Apply"
                      icon={<FiPlay />}
                      colorScheme="purple"
                      size="sm"
                      isLoading={saving}
                    />
                  </HStack>
                </Box>
              ))}
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" onClick={onTemplateClose}>Fechar</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </VStack>
  );
};

export default ParametersEditor;
