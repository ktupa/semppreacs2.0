// frontend/src/components/SystemUpdater.tsx
import { useState, useEffect } from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Button,
  Badge,
  Card,
  CardBody,
  CardHeader,
  Heading,
  useToast,
  Progress,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
  Divider,
  List,
  ListItem,
  ListIcon,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  useDisclosure,
  Spinner,
  Icon,
  Tooltip,
  Switch,
  FormControl,
  FormLabel,
} from '@chakra-ui/react';
import {
  FiDownload,
  FiRefreshCw,
  FiCheck,
  FiAlertTriangle,
  FiClock,
  FiPackage,
  FiArrowUp,
  FiArchive,
  FiRotateCcw,
} from 'react-icons/fi';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE || '';

interface UpdateStatus {
  available: boolean;
  current_version: string;
  new_version?: string;
  changelog?: string[];
  last_check?: string;
}

interface BackupInfo {
  name: string;
  path: string;
  size_mb: number;
  created: string;
}

interface UpdateConfig {
  auto_update: boolean;
  check_interval_hours: number;
}

export default function SystemUpdater() {
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [config, setConfig] = useState<UpdateConfig>({ auto_update: false, check_interval_hours: 24 });
  const [isChecking, setIsChecking] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const toast = useToast();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { isOpen: isBackupsOpen, onOpen: onBackupsOpen, onClose: onBackupsClose } = useDisclosure();

  useEffect(() => {
    checkForUpdates();
    loadBackups();
    loadConfig();
  }, []);

  const checkForUpdates = async () => {
    setIsChecking(true);
    try {
      const response = await axios.get<UpdateStatus>(`${API_BASE}/api/updates/check`);
      setUpdateStatus(response.data);
      
      if (response.data.available) {
        toast({
          title: 'Nova versão disponível!',
          description: `Versão ${response.data.new_version} está disponível para instalação.`,
          status: 'info',
          duration: 5000,
          isClosable: true,
        });
      }
    } catch {
      toast({
        title: 'Erro',
        description: 'Não foi possível verificar atualizações',
        status: 'error',
        duration: 3000,
      });
    } finally {
      setIsChecking(false);
    }
  };

  const loadBackups = async () => {
    try {
      const response = await axios.get<BackupInfo[]>(`${API_BASE}/api/updates/backups`);
      setBackups(response.data);
    } catch {
      console.error('Erro ao carregar backups');
    }
  };

  const loadConfig = async () => {
    try {
      const response = await axios.get(`${API_BASE}/api/updates/config`);
      setConfig({
        auto_update: response.data.auto_update || false,
        check_interval_hours: response.data.check_interval_hours || 24,
      });
    } catch {
      console.error('Erro ao carregar configuração');
    }
  };

  const applyUpdate = async () => {
    setIsUpdating(true);
    try {
      await axios.post(`${API_BASE}/api/updates/apply`, {
        version: updateStatus?.new_version,
      });
      
      toast({
        title: 'Atualização iniciada',
        description: 'O sistema será atualizado e reiniciado. Por favor, aguarde alguns minutos.',
        status: 'success',
        duration: 10000,
        isClosable: true,
      });
      
      onClose();
      
      // Aguarda e tenta reconectar
      setTimeout(() => {
        window.location.reload();
      }, 30000);
    } catch {
      toast({
        title: 'Erro',
        description: 'Não foi possível iniciar a atualização',
        status: 'error',
        duration: 5000,
      });
      setIsUpdating(false);
    }
  };

  const createBackup = async () => {
    setIsBackingUp(true);
    try {
      await axios.post(`${API_BASE}/api/updates/backup`);
      toast({
        title: 'Backup criado',
        description: 'Backup do sistema criado com sucesso',
        status: 'success',
        duration: 3000,
      });
      loadBackups();
    } catch {
      toast({
        title: 'Erro',
        description: 'Não foi possível criar backup',
        status: 'error',
        duration: 3000,
      });
    } finally {
      setIsBackingUp(false);
    }
  };

  const restoreBackup = async (backupName: string) => {
    if (!confirm(`Tem certeza que deseja restaurar o backup ${backupName}? O sistema será reiniciado.`)) {
      return;
    }

    try {
      await axios.post(`${API_BASE}/api/updates/restore/${backupName}`);
      toast({
        title: 'Restauração iniciada',
        description: 'O sistema será restaurado e reiniciado.',
        status: 'success',
        duration: 5000,
      });
    } catch {
      toast({
        title: 'Erro',
        description: 'Não foi possível restaurar o backup',
        status: 'error',
        duration: 3000,
      });
    }
  };

  const toggleAutoUpdate = async () => {
    const newConfig = { ...config, auto_update: !config.auto_update };
    try {
      await axios.put(`${API_BASE}/api/updates/config`, newConfig);
      setConfig(newConfig);
      toast({
        title: 'Configuração salva',
        status: 'success',
        duration: 2000,
      });
    } catch {
      toast({
        title: 'Erro ao salvar configuração',
        status: 'error',
        duration: 3000,
      });
    }
  };

  return (
    <Card>
      <CardHeader pb={2}>
        <HStack justify="space-between">
          <HStack>
            <Icon as={FiPackage} boxSize={5} color="blue.500" />
            <Heading size="md">Sistema de Atualizações</Heading>
          </HStack>
          <HStack spacing={2}>
            <Button
              size="sm"
              leftIcon={<FiArchive />}
              variant="outline"
              onClick={onBackupsOpen}
            >
              Backups ({backups.length})
            </Button>
            <Button
              size="sm"
              leftIcon={<FiRefreshCw />}
              onClick={checkForUpdates}
              isLoading={isChecking}
              loadingText="Verificando"
            >
              Verificar
            </Button>
          </HStack>
        </HStack>
      </CardHeader>

      <CardBody pt={2}>
        <VStack spacing={4} align="stretch">
          {/* Versão Atual */}
          <HStack justify="space-between" p={3} bg="gray.50" borderRadius="md" _dark={{ bg: 'gray.700' }}>
            <VStack align="start" spacing={0}>
              <Text fontSize="sm" color="gray.500">Versão Atual</Text>
              <HStack>
                <Text fontWeight="bold" fontSize="lg">
                  v{updateStatus?.current_version || '...'}
                </Text>
                {!updateStatus?.available && updateStatus && (
                  <Badge colorScheme="green">
                    <HStack spacing={1}>
                      <FiCheck />
                      <Text>Atualizado</Text>
                    </HStack>
                  </Badge>
                )}
              </HStack>
            </VStack>
            
            {updateStatus?.last_check && (
              <VStack align="end" spacing={0}>
                <Text fontSize="xs" color="gray.500">Última verificação</Text>
                <HStack spacing={1}>
                  <FiClock size={12} />
                  <Text fontSize="sm">
                    {new Date(updateStatus.last_check).toLocaleString('pt-BR')}
                  </Text>
                </HStack>
              </VStack>
            )}
          </HStack>

          {/* Alerta de Nova Versão */}
          {updateStatus?.available && (
            <Alert status="info" borderRadius="md">
              <AlertIcon as={FiArrowUp} />
              <Box flex="1">
                <AlertTitle>Nova versão disponível!</AlertTitle>
                <AlertDescription>
                  Versão {updateStatus.new_version} está disponível para instalação.
                </AlertDescription>
              </Box>
              <Button
                colorScheme="blue"
                size="sm"
                leftIcon={<FiDownload />}
                onClick={onOpen}
              >
                Atualizar
              </Button>
            </Alert>
          )}

          {/* Configuração de Auto-Update */}
          <FormControl display="flex" alignItems="center">
            <FormLabel mb={0} fontSize="sm">
              Atualização automática
            </FormLabel>
            <Tooltip label="Quando ativado, o sistema verifica e notifica sobre novas atualizações automaticamente">
              <Switch
                isChecked={config.auto_update}
                onChange={toggleAutoUpdate}
                colorScheme="blue"
              />
            </Tooltip>
          </FormControl>

          {/* Botão de Backup Manual */}
          <Button
            variant="outline"
            leftIcon={<FiArchive />}
            onClick={createBackup}
            isLoading={isBackingUp}
            loadingText="Criando backup..."
            size="sm"
          >
            Criar Backup Manual
          </Button>
        </VStack>
      </CardBody>

      {/* Modal de Confirmação de Update */}
      <Modal isOpen={isOpen} onClose={onClose} size="lg">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>
            <HStack>
              <FiDownload />
              <Text>Atualizar Sistema</Text>
            </HStack>
          </ModalHeader>
          <ModalCloseButton />
          
          <ModalBody>
            <VStack spacing={4} align="stretch">
              <Alert status="warning" borderRadius="md">
                <AlertIcon as={FiAlertTriangle} />
                <Box>
                  <AlertTitle>Atenção!</AlertTitle>
                  <AlertDescription>
                    O sistema será atualizado e reiniciado. Um backup será criado automaticamente.
                  </AlertDescription>
                </Box>
              </Alert>

              <Box>
                <Text fontWeight="bold" mb={2}>Atualizando de v{updateStatus?.current_version} para v{updateStatus?.new_version}</Text>
                
                {updateStatus?.changelog && updateStatus.changelog.length > 0 && (
                  <>
                    <Text fontSize="sm" color="gray.500" mb={2}>Mudanças:</Text>
                    <List spacing={1} fontSize="sm" maxH="200px" overflowY="auto">
                      {updateStatus.changelog.slice(0, 10).map((change, idx) => (
                        <ListItem key={idx}>
                          <ListIcon as={FiCheck} color="green.500" />
                          {change}
                        </ListItem>
                      ))}
                    </List>
                  </>
                )}
              </Box>

              {isUpdating && (
                <VStack>
                  <Spinner size="lg" color="blue.500" />
                  <Text>Aplicando atualização...</Text>
                  <Progress size="sm" isIndeterminate colorScheme="blue" w="full" />
                </VStack>
              )}
            </VStack>
          </ModalBody>

          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={onClose} isDisabled={isUpdating}>
              Cancelar
            </Button>
            <Button
              colorScheme="blue"
              onClick={applyUpdate}
              isLoading={isUpdating}
              loadingText="Atualizando..."
              leftIcon={<FiDownload />}
            >
              Confirmar Atualização
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Modal de Backups */}
      <Modal isOpen={isBackupsOpen} onClose={onBackupsClose} size="lg">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>
            <HStack>
              <FiArchive />
              <Text>Gerenciar Backups</Text>
            </HStack>
          </ModalHeader>
          <ModalCloseButton />
          
          <ModalBody>
            <VStack spacing={3} align="stretch">
              {backups.length === 0 ? (
                <Text color="gray.500" textAlign="center" py={4}>
                  Nenhum backup encontrado
                </Text>
              ) : (
                backups.map((backup) => (
                  <HStack
                    key={backup.name}
                    p={3}
                    borderWidth={1}
                    borderRadius="md"
                    justify="space-between"
                  >
                    <VStack align="start" spacing={0}>
                      <Text fontWeight="medium" fontSize="sm">{backup.name}</Text>
                      <HStack spacing={3} fontSize="xs" color="gray.500">
                        <Text>{backup.size_mb} MB</Text>
                        <Text>{new Date(backup.created).toLocaleString('pt-BR')}</Text>
                      </HStack>
                    </VStack>
                    <Tooltip label="Restaurar este backup">
                      <Button
                        size="xs"
                        colorScheme="orange"
                        variant="outline"
                        leftIcon={<FiRotateCcw />}
                        onClick={() => restoreBackup(backup.name)}
                      >
                        Restaurar
                      </Button>
                    </Tooltip>
                  </HStack>
                ))
              )}
            </VStack>
          </ModalBody>

          <ModalFooter>
            <Button variant="ghost" onClick={onBackupsClose}>
              Fechar
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Card>
  );
}
