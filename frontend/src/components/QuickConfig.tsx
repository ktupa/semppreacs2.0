// components/QuickConfig.tsx
// Configuração rápida dos parâmetros mais comuns do dispositivo

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Card,
  CardHeader,
  CardBody,
  Text,
  Badge,
  Flex,
  Grid,
  Spinner,
  Input,
  InputGroup,
  InputRightElement,
  Button,
  IconButton,
  Icon,
  Alert,
  AlertIcon,
  VStack,
  HStack,
  useColorModeValue,
  FormControl,
  FormLabel,
  FormHelperText,
  Switch,
  Select,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  useToast,
  Tabs,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
  Tag,
  TagLabel,
  TagLeftIcon,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  useDisclosure,
} from '@chakra-ui/react';
import {
  FiWifi,
  FiGlobe,
  FiServer,
  FiSettings,
  FiSave,
  FiRefreshCw,
  FiEye,
  FiEyeOff,
  FiCheck,
  FiAlertTriangle,
} from 'react-icons/fi';
import { deviceApi } from '../services/apiConfig';

interface Props {
  deviceId: string;
  onSaved?: () => void;
}

interface ConfigValues {
  // WiFi 2.4GHz
  wifi_24_enabled: boolean;
  wifi_24_ssid: string;
  wifi_24_password: string;
  wifi_24_channel: number;
  wifi_24_hidden: boolean;
  // WiFi 5GHz
  wifi_5_enabled: boolean;
  wifi_5_ssid: string;
  wifi_5_password: string;
  wifi_5_channel: number;
  wifi_5_hidden: boolean;
  // LAN / DHCP
  lan_ip: string;
  lan_subnet: string;
  dhcp_enabled: boolean;
  dhcp_start: string;
  dhcp_end: string;
  dhcp_lease: number;
  dns_servers: string;
  // WAN / PPPoE
  pppoe_username: string;
  pppoe_password: string;
  wan_mtu: number;
  nat_enabled: boolean;
}

// Mapeamento de parâmetros TR-069 (TR-098) e TR-181 - Multi-Modelo
const parameterPathsMulti: Record<string, string[]> = {
  // WiFi 2.4GHz (normalmente índice 1)
  wifi_24_enabled: [
    'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.Enable',
    'Device.WiFi.SSID.1.Enable', // TR-181
    'Device.WiFi.Radio.1.Enable', // TR-181 alternativo
  ],
  wifi_24_ssid: [
    'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID',
    'Device.WiFi.SSID.1.SSID', // TR-181
  ],
  wifi_24_password: [
    'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.PreSharedKey.1.PreSharedKey',
    'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.KeyPassphrase',
    'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.X_TP_PreSharedKey', // TP-Link
    'Device.WiFi.AccessPoint.1.Security.KeyPassphrase', // TR-181
    'Device.WiFi.AccessPoint.1.Security.PreSharedKey', // TR-181
  ],
  wifi_24_channel: [
    'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.Channel',
    'Device.WiFi.Radio.1.Channel', // TR-181
  ],
  wifi_24_hidden: [
    'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSIDAdvertisementEnabled',
    'Device.WiFi.AccessPoint.1.SSIDAdvertisementEnabled', // TR-181
  ],
  // WiFi 5GHz (normalmente índice 5 ou 2 dependendo do modelo)
  wifi_5_enabled: [
    'InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.Enable',
    'InternetGatewayDevice.LANDevice.1.WLANConfiguration.2.Enable', // TP-Link
    'Device.WiFi.SSID.2.Enable', // TR-181 (Zyxel, TP-Link)
    'Device.WiFi.SSID.3.Enable', // TR-181 alternativo
    'Device.WiFi.Radio.2.Enable', // TR-181
  ],
  wifi_5_ssid: [
    'InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.SSID',
    'InternetGatewayDevice.LANDevice.1.WLANConfiguration.2.SSID', // TP-Link
    'Device.WiFi.SSID.2.SSID', // TR-181
    'Device.WiFi.SSID.3.SSID', // TR-181 alternativo
  ],
  wifi_5_password: [
    'InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.PreSharedKey.1.PreSharedKey',
    'InternetGatewayDevice.LANDevice.1.WLANConfiguration.2.PreSharedKey.1.PreSharedKey', // TP-Link
    'InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.KeyPassphrase',
    'InternetGatewayDevice.LANDevice.1.WLANConfiguration.2.KeyPassphrase',
    'Device.WiFi.AccessPoint.2.Security.KeyPassphrase', // TR-181
    'Device.WiFi.AccessPoint.3.Security.KeyPassphrase', // TR-181
    'Device.WiFi.AccessPoint.2.Security.PreSharedKey', // TR-181
  ],
  wifi_5_channel: [
    'InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.Channel',
    'InternetGatewayDevice.LANDevice.1.WLANConfiguration.2.Channel', // TP-Link
    'Device.WiFi.Radio.2.Channel', // TR-181
    'Device.WiFi.Radio.3.Channel', // TR-181 alternativo
  ],
  wifi_5_hidden: [
    'InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.SSIDAdvertisementEnabled',
    'InternetGatewayDevice.LANDevice.1.WLANConfiguration.2.SSIDAdvertisementEnabled', // TP-Link
    'Device.WiFi.AccessPoint.2.SSIDAdvertisementEnabled', // TR-181
    'Device.WiFi.AccessPoint.3.SSIDAdvertisementEnabled', // TR-181
  ],
  // LAN / DHCP
  lan_ip: [
    'InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.IPRouters',
    'InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.IPInterface.1.IPInterfaceIPAddress',
    'Device.IP.Interface.1.IPv4Address.1.IPAddress', // TR-181
    'Device.IP.Interface.4.IPv4Address.1.IPAddress', // TR-181 Zyxel LAN
  ],
  lan_subnet: [
    'InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.SubnetMask',
    'Device.IP.Interface.1.IPv4Address.1.SubnetMask', // TR-181
    'Device.IP.Interface.4.IPv4Address.1.SubnetMask', // TR-181 Zyxel
  ],
  dhcp_enabled: [
    'InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.DHCPServerEnable',
    'Device.DHCPv4.Server.Enable', // TR-181
    'Device.DHCPv4.Server.Pool.1.Enable', // TR-181
  ],
  dhcp_start: [
    'InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.MinAddress',
    'Device.DHCPv4.Server.Pool.1.MinAddress', // TR-181
  ],
  dhcp_end: [
    'InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.MaxAddress',
    'Device.DHCPv4.Server.Pool.1.MaxAddress', // TR-181
  ],
  dhcp_lease: [
    'InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.DHCPLeaseTime',
    'Device.DHCPv4.Server.Pool.1.LeaseTime', // TR-181
  ],
  dns_servers: [
    'InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.DNSServers',
    'Device.DHCPv4.Server.Pool.1.DNSServers', // TR-181
    'Device.DHCPv4.Client.1.DNSServers', // TR-181
  ],
  // WAN / PPPoE - Multi-modelo
  pppoe_username: [
    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Username',
    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.2.Username', // ZTE
    'Device.PPP.Interface.1.Username', // TR-181
    'Device.PPP.Interface.2.Username', // TR-181 Zyxel
  ],
  pppoe_password: [
    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Password',
    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.2.Password', // ZTE
    'Device.PPP.Interface.1.Password', // TR-181
    'Device.PPP.Interface.2.Password', // TR-181 Zyxel
  ],
  wan_mtu: [
    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.MTU',
    'Device.PPP.Interface.1.MaxMRUSize', // TR-181
    'Device.PPP.Interface.2.MaxMRUSize', // TR-181 Zyxel
    'Device.IP.Interface.3.MaxMTUSize', // TR-181
  ],
  nat_enabled: [
    'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.NATEnabled',
    'Device.NAT.InterfaceSetting.1.Enable', // TR-181
    'Device.NAT.PortMapping.Enable', // TR-181
  ],
};

// Função para obter valor de múltiplos paths possíveis
const getMultiPathValue = (params: Record<string, any>, paths: string[]): any => {
  for (const path of paths) {
    if (params[path]?.value !== undefined && params[path]?.value !== null && params[path]?.value !== '') {
      return params[path].value;
    }
  }
  return undefined;
};

// Função para obter o path correto que existe no dispositivo
const getExistingPath = (params: Record<string, any>, paths: string[]): string | null => {
  for (const path of paths) {
    if (params[path] !== undefined) {
      return path;
    }
  }
  return paths[0]; // Fallback para o primeiro path (TR-098)
};

const QuickConfig: React.FC<Props> = ({ deviceId, onSaved }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<Partial<ConfigValues>>({});
  const [originalValues, setOriginalValues] = useState<Partial<ConfigValues>>({});
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [changedFields, setChangedFields] = useState<Set<string>>(new Set());

  const { isOpen: isConfirmOpen, onOpen: onConfirmOpen, onClose: onConfirmClose } = useDisclosure();

  const toast = useToast();
  const cardBg = useColorModeValue('white', 'gray.800');
  const inputBg = useColorModeValue('gray.50', 'gray.700');
  
  // Armazena o path correto para cada campo (TR-098 ou TR-181)
  const [activePaths, setActivePaths] = useState<Record<string, string>>({});

  // Buscar valores atuais
  const fetchCurrentValues = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(deviceApi(deviceId, '/parameters/all'));
      if (!res.ok) throw new Error('Erro ao buscar parâmetros');

      const data = await res.json();
      const params = data.parameters;

      // Mapear valores dos paths para nosso formato usando multi-paths
      const current: Partial<ConfigValues> = {};
      const foundPaths: Record<string, string> = {};

      Object.entries(parameterPathsMulti).forEach(([key, paths]) => {
        // Tenta encontrar valor em qualquer um dos paths
        const value = getMultiPathValue(params, paths);
        const existingPath = getExistingPath(params, paths);
        
        if (existingPath) {
          foundPaths[key] = existingPath;
        }
        
        if (value !== undefined) {
          // Tratar inversão do hidden (SSIDAdvertisementEnabled = NOT hidden)
          if (key.includes('hidden')) {
            (current as any)[key] = !value;
          } else {
            (current as any)[key] = value;
          }
        }
      });

      setActivePaths(foundPaths);
      setValues(current);
      setOriginalValues(current);
      setChangedFields(new Set());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [deviceId]);

  useEffect(() => {
    fetchCurrentValues();
  }, [fetchCurrentValues]);

  // Atualizar valor
  const handleChange = (field: keyof ConfigValues, value: any) => {
    setValues(prev => ({ ...prev, [field]: value }));
    
    // Verificar se mudou do original
    if (originalValues[field] !== value) {
      setChangedFields(prev => new Set([...prev, field]));
    } else {
      setChangedFields(prev => {
        const next = new Set(prev);
        next.delete(field);
        return next;
      });
    }
  };

  // Salvar alterações
  const handleSave = async () => {
    if (changedFields.size === 0) {
      toast({
        title: 'Nenhuma alteração',
        status: 'info',
        duration: 2000,
      });
      return;
    }

    onConfirmOpen();
  };

  const confirmSave = async () => {
    setSaving(true);
    onConfirmClose();

    try {
      // Construir objeto de parâmetros alterados - usa path ativo (TR-098 ou TR-181)
      const paramsToSet: Record<string, any> = {};

      changedFields.forEach(field => {
        // Usa o path descoberto (TR-098 ou TR-181) ou fallback para o primeiro da lista
        const path = activePaths[field] || parameterPathsMulti[field as keyof typeof parameterPathsMulti]?.[0];
        let value = values[field as keyof ConfigValues];

        // Inverter hidden para SSIDAdvertisementEnabled
        if (field.includes('hidden')) {
          value = !value;
        }

        if (path) {
          paramsToSet[path] = value;
        }
      });

      const res = await fetch(deviceApi(deviceId, '/parameters/set'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parameters: paramsToSet,
          auto_refresh: true
        })
      });

      if (!res.ok) throw new Error('Erro ao salvar configurações');

      const result = await res.json();

      toast({
        title: result.success ? 'Configurações salvas!' : 'Aviso',
        description: result.success 
          ? `${changedFields.size} parâmetros atualizados com sucesso`
          : 'Algumas alterações podem não ter sido aplicadas',
        status: result.success ? 'success' : 'warning',
        duration: 4000,
        isClosable: true,
      });

      if (result.success) {
        setOriginalValues(values);
        setChangedFields(new Set());
        onSaved?.();
        // Refresh após 3s
        setTimeout(fetchCurrentValues, 3000);
      }
    } catch (err: any) {
      toast({
        title: 'Erro ao salvar',
        description: err.message,
        status: 'error',
        duration: 4000,
        isClosable: true,
      });
    } finally {
      setSaving(false);
    }
  };

  // Toggle password visibility
  const togglePassword = (field: string) => {
    setShowPasswords(prev => ({ ...prev, [field]: !prev[field] }));
  };

  // Verificar se campo foi alterado
  const isChanged = (field: string) => changedFields.has(field);

  if (loading) {
    return (
      <Flex justify="center" align="center" h="300px">
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
      {/* Header */}
      <Flex justify="space-between" align="center">
        <HStack>
          <Icon as={FiSettings} color="blue.500" />
          <Text fontWeight="bold" fontSize="md">Configuração Rápida</Text>
          {changedFields.size > 0 && (
            <Tag colorScheme="orange" size="sm">
              <TagLeftIcon as={FiAlertTriangle} />
              <TagLabel>{changedFields.size} alteração(ões)</TagLabel>
            </Tag>
          )}
        </HStack>
        <HStack>
          <Button
            size="sm"
            leftIcon={<FiRefreshCw />}
            onClick={fetchCurrentValues}
            variant="ghost"
          >
            Atualizar
          </Button>
          <Button
            size="sm"
            leftIcon={<FiSave />}
            colorScheme="blue"
            onClick={handleSave}
            isLoading={saving}
            isDisabled={changedFields.size === 0}
          >
            Salvar ({changedFields.size})
          </Button>
        </HStack>
      </Flex>

      {/* Tabs de configuração */}
      <Tabs variant="enclosed" colorScheme="blue">
        <TabList>
          <Tab><HStack><Icon as={FiWifi} /><Text>WiFi</Text></HStack></Tab>
          <Tab><HStack><Icon as={FiServer} /><Text>LAN/DHCP</Text></HStack></Tab>
          <Tab><HStack><Icon as={FiGlobe} /><Text>WAN/PPPoE</Text></HStack></Tab>
        </TabList>

        <TabPanels>
          {/* WiFi Tab */}
          <TabPanel px={0}>
            <Grid templateColumns={{ base: '1fr', lg: 'repeat(2, 1fr)' }} gap={4}>
              {/* WiFi 2.4GHz */}
              <Card bg={cardBg} variant="outline">
                <CardHeader pb={2}>
                  <HStack>
                    <Badge colorScheme="blue">2.4 GHz</Badge>
                    <Text fontWeight="bold">WiFi Principal</Text>
                  </HStack>
                </CardHeader>
                <CardBody>
                  <VStack spacing={4} align="stretch">
                    <FormControl display="flex" alignItems="center">
                      <FormLabel mb={0} flex="1">Ativar WiFi 2.4GHz</FormLabel>
                      <Switch
                        isChecked={values.wifi_24_enabled as boolean}
                        onChange={(e) => handleChange('wifi_24_enabled', e.target.checked)}
                        colorScheme="green"
                      />
                    </FormControl>

                    <FormControl>
                      <FormLabel fontSize="sm">
                        SSID (Nome da rede)
                        {isChanged('wifi_24_ssid') && <Badge ml={2} colorScheme="orange" size="sm">alterado</Badge>}
                      </FormLabel>
                      <Input
                        value={values.wifi_24_ssid || ''}
                        onChange={(e) => handleChange('wifi_24_ssid', e.target.value)}
                        bg={inputBg}
                        size="sm"
                      />
                    </FormControl>

                    <FormControl>
                      <FormLabel fontSize="sm">
                        Senha WiFi
                        {isChanged('wifi_24_password') && <Badge ml={2} colorScheme="orange" size="sm">alterado</Badge>}
                      </FormLabel>
                      <InputGroup size="sm">
                        <Input
                          type={showPasswords['wifi_24'] ? 'text' : 'password'}
                          value={values.wifi_24_password || ''}
                          onChange={(e) => handleChange('wifi_24_password', e.target.value)}
                          bg={inputBg}
                        />
                        <InputRightElement>
                          <IconButton
                            aria-label="Toggle password"
                            icon={showPasswords['wifi_24'] ? <FiEyeOff /> : <FiEye />}
                            size="xs"
                            variant="ghost"
                            onClick={() => togglePassword('wifi_24')}
                          />
                        </InputRightElement>
                      </InputGroup>
                    </FormControl>

                    <FormControl>
                      <FormLabel fontSize="sm">Canal</FormLabel>
                      <Select
                        value={values.wifi_24_channel || 0}
                        onChange={(e) => handleChange('wifi_24_channel', parseInt(e.target.value))}
                        bg={inputBg}
                        size="sm"
                      >
                        <option value={0}>Auto</option>
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(ch => (
                          <option key={ch} value={ch}>Canal {ch}</option>
                        ))}
                      </Select>
                    </FormControl>

                    <FormControl display="flex" alignItems="center">
                      <FormLabel mb={0} flex="1" fontSize="sm">Ocultar SSID</FormLabel>
                      <Switch
                        isChecked={values.wifi_24_hidden as boolean}
                        onChange={(e) => handleChange('wifi_24_hidden', e.target.checked)}
                        colorScheme="purple"
                        size="sm"
                      />
                    </FormControl>
                  </VStack>
                </CardBody>
              </Card>

              {/* WiFi 5GHz */}
              <Card bg={cardBg} variant="outline">
                <CardHeader pb={2}>
                  <HStack>
                    <Badge colorScheme="purple">5 GHz</Badge>
                    <Text fontWeight="bold">WiFi Dual Band</Text>
                  </HStack>
                </CardHeader>
                <CardBody>
                  <VStack spacing={4} align="stretch">
                    <FormControl display="flex" alignItems="center">
                      <FormLabel mb={0} flex="1">Ativar WiFi 5GHz</FormLabel>
                      <Switch
                        isChecked={values.wifi_5_enabled as boolean}
                        onChange={(e) => handleChange('wifi_5_enabled', e.target.checked)}
                        colorScheme="green"
                      />
                    </FormControl>

                    <FormControl>
                      <FormLabel fontSize="sm">
                        SSID (Nome da rede)
                        {isChanged('wifi_5_ssid') && <Badge ml={2} colorScheme="orange" size="sm">alterado</Badge>}
                      </FormLabel>
                      <Input
                        value={values.wifi_5_ssid || ''}
                        onChange={(e) => handleChange('wifi_5_ssid', e.target.value)}
                        bg={inputBg}
                        size="sm"
                      />
                    </FormControl>

                    <FormControl>
                      <FormLabel fontSize="sm">
                        Senha WiFi
                        {isChanged('wifi_5_password') && <Badge ml={2} colorScheme="orange" size="sm">alterado</Badge>}
                      </FormLabel>
                      <InputGroup size="sm">
                        <Input
                          type={showPasswords['wifi_5'] ? 'text' : 'password'}
                          value={values.wifi_5_password || ''}
                          onChange={(e) => handleChange('wifi_5_password', e.target.value)}
                          bg={inputBg}
                        />
                        <InputRightElement>
                          <IconButton
                            aria-label="Toggle password"
                            icon={showPasswords['wifi_5'] ? <FiEyeOff /> : <FiEye />}
                            size="xs"
                            variant="ghost"
                            onClick={() => togglePassword('wifi_5')}
                          />
                        </InputRightElement>
                      </InputGroup>
                    </FormControl>

                    <FormControl>
                      <FormLabel fontSize="sm">Canal</FormLabel>
                      <Select
                        value={values.wifi_5_channel || 0}
                        onChange={(e) => handleChange('wifi_5_channel', parseInt(e.target.value))}
                        bg={inputBg}
                        size="sm"
                      >
                        <option value={0}>Auto</option>
                        {[36, 40, 44, 48, 149, 153, 157, 161].map(ch => (
                          <option key={ch} value={ch}>Canal {ch}</option>
                        ))}
                      </Select>
                    </FormControl>

                    <FormControl display="flex" alignItems="center">
                      <FormLabel mb={0} flex="1" fontSize="sm">Ocultar SSID</FormLabel>
                      <Switch
                        isChecked={values.wifi_5_hidden as boolean}
                        onChange={(e) => handleChange('wifi_5_hidden', e.target.checked)}
                        colorScheme="purple"
                        size="sm"
                      />
                    </FormControl>
                  </VStack>
                </CardBody>
              </Card>
            </Grid>
          </TabPanel>

          {/* LAN/DHCP Tab */}
          <TabPanel px={0}>
            <Card bg={cardBg} variant="outline">
              <CardHeader pb={2}>
                <HStack>
                  <Icon as={FiServer} color="teal.500" />
                  <Text fontWeight="bold">Configurações LAN e DHCP</Text>
                </HStack>
              </CardHeader>
              <CardBody>
                <Grid templateColumns={{ base: '1fr', md: 'repeat(2, 1fr)' }} gap={4}>
                  <FormControl>
                    <FormLabel fontSize="sm">
                      IP do Gateway
                      {isChanged('lan_ip') && <Badge ml={2} colorScheme="orange" size="sm">alterado</Badge>}
                    </FormLabel>
                    <Input
                      value={values.lan_ip || ''}
                      onChange={(e) => handleChange('lan_ip', e.target.value)}
                      bg={inputBg}
                      size="sm"
                      placeholder="192.168.0.1"
                    />
                  </FormControl>

                  <FormControl>
                    <FormLabel fontSize="sm">Máscara de Sub-rede</FormLabel>
                    <Input
                      value={values.lan_subnet || ''}
                      onChange={(e) => handleChange('lan_subnet', e.target.value)}
                      bg={inputBg}
                      size="sm"
                      placeholder="255.255.255.0"
                    />
                  </FormControl>

                  <FormControl display="flex" alignItems="center">
                    <FormLabel mb={0} flex="1">Servidor DHCP</FormLabel>
                    <Switch
                      isChecked={values.dhcp_enabled as boolean}
                      onChange={(e) => handleChange('dhcp_enabled', e.target.checked)}
                      colorScheme="green"
                    />
                  </FormControl>

                  <Box /> {/* Spacer */}

                  <FormControl>
                    <FormLabel fontSize="sm">
                      IP Inicial DHCP
                      {isChanged('dhcp_start') && <Badge ml={2} colorScheme="orange" size="sm">alterado</Badge>}
                    </FormLabel>
                    <Input
                      value={values.dhcp_start || ''}
                      onChange={(e) => handleChange('dhcp_start', e.target.value)}
                      bg={inputBg}
                      size="sm"
                      placeholder="192.168.0.100"
                      isDisabled={!values.dhcp_enabled}
                    />
                  </FormControl>

                  <FormControl>
                    <FormLabel fontSize="sm">
                      IP Final DHCP
                      {isChanged('dhcp_end') && <Badge ml={2} colorScheme="orange" size="sm">alterado</Badge>}
                    </FormLabel>
                    <Input
                      value={values.dhcp_end || ''}
                      onChange={(e) => handleChange('dhcp_end', e.target.value)}
                      bg={inputBg}
                      size="sm"
                      placeholder="192.168.0.199"
                      isDisabled={!values.dhcp_enabled}
                    />
                  </FormControl>

                  <FormControl>
                    <FormLabel fontSize="sm">Tempo de Lease (segundos)</FormLabel>
                    <NumberInput
                      value={values.dhcp_lease || 86400}
                      onChange={(_, val) => handleChange('dhcp_lease', val)}
                      min={60}
                      max={604800}
                      size="sm"
                      isDisabled={!values.dhcp_enabled}
                    >
                      <NumberInputField bg={inputBg} />
                      <NumberInputStepper>
                        <NumberIncrementStepper />
                        <NumberDecrementStepper />
                      </NumberInputStepper>
                    </NumberInput>
                    <FormHelperText fontSize="xs">
                      Padrão: 86400 (24 horas)
                    </FormHelperText>
                  </FormControl>

                  <FormControl>
                    <FormLabel fontSize="sm">Servidores DNS</FormLabel>
                    <Input
                      value={values.dns_servers || ''}
                      onChange={(e) => handleChange('dns_servers', e.target.value)}
                      bg={inputBg}
                      size="sm"
                      placeholder="8.8.8.8,8.8.4.4"
                    />
                    <FormHelperText fontSize="xs">
                      Separados por vírgula
                    </FormHelperText>
                  </FormControl>
                </Grid>
              </CardBody>
            </Card>
          </TabPanel>

          {/* WAN/PPPoE Tab */}
          <TabPanel px={0}>
            <Card bg={cardBg} variant="outline">
              <CardHeader pb={2}>
                <HStack>
                  <Icon as={FiGlobe} color="green.500" />
                  <Text fontWeight="bold">Configurações WAN e PPPoE</Text>
                </HStack>
              </CardHeader>
              <CardBody>
                <Grid templateColumns={{ base: '1fr', md: 'repeat(2, 1fr)' }} gap={4}>
                  <FormControl>
                    <FormLabel fontSize="sm">
                      Usuário PPPoE
                      {isChanged('pppoe_username') && <Badge ml={2} colorScheme="orange" size="sm">alterado</Badge>}
                    </FormLabel>
                    <Input
                      value={values.pppoe_username || ''}
                      onChange={(e) => handleChange('pppoe_username', e.target.value)}
                      bg={inputBg}
                      size="sm"
                      placeholder="usuario@provedor"
                    />
                  </FormControl>

                  <FormControl>
                    <FormLabel fontSize="sm">
                      Senha PPPoE
                      {isChanged('pppoe_password') && <Badge ml={2} colorScheme="orange" size="sm">alterado</Badge>}
                    </FormLabel>
                    <InputGroup size="sm">
                      <Input
                        type={showPasswords['pppoe'] ? 'text' : 'password'}
                        value={values.pppoe_password || ''}
                        onChange={(e) => handleChange('pppoe_password', e.target.value)}
                        bg={inputBg}
                      />
                      <InputRightElement>
                        <IconButton
                          aria-label="Toggle password"
                          icon={showPasswords['pppoe'] ? <FiEyeOff /> : <FiEye />}
                          size="xs"
                          variant="ghost"
                          onClick={() => togglePassword('pppoe')}
                        />
                      </InputRightElement>
                    </InputGroup>
                  </FormControl>

                  <FormControl>
                    <FormLabel fontSize="sm">MTU</FormLabel>
                    <NumberInput
                      value={values.wan_mtu || 1492}
                      onChange={(_, val) => handleChange('wan_mtu', val)}
                      min={576}
                      max={1500}
                      size="sm"
                    >
                      <NumberInputField bg={inputBg} />
                      <NumberInputStepper>
                        <NumberIncrementStepper />
                        <NumberDecrementStepper />
                      </NumberInputStepper>
                    </NumberInput>
                    <FormHelperText fontSize="xs">
                      Padrão PPPoE: 1492
                    </FormHelperText>
                  </FormControl>

                  <FormControl display="flex" alignItems="center">
                    <FormLabel mb={0} flex="1">NAT Ativo</FormLabel>
                    <Switch
                      isChecked={values.nat_enabled as boolean}
                      onChange={(e) => handleChange('nat_enabled', e.target.checked)}
                      colorScheme="green"
                    />
                  </FormControl>
                </Grid>

                <Alert status="info" mt={4} borderRadius="md" size="sm">
                  <AlertIcon />
                  <Text fontSize="xs">
                    Alterações no PPPoE podem causar desconexão temporária do dispositivo.
                    Certifique-se de que os dados estão corretos antes de salvar.
                  </Text>
                </Alert>
              </CardBody>
            </Card>
          </TabPanel>
        </TabPanels>
      </Tabs>

      {/* Modal de Confirmação */}
      <Modal isOpen={isConfirmOpen} onClose={onConfirmClose}>
        <ModalOverlay />
        <ModalContent bg={cardBg}>
          <ModalHeader>Confirmar Alterações</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={3} align="stretch">
              <Text>
                Você está prestes a alterar <strong>{changedFields.size}</strong> parâmetros:
              </Text>
              <Box bg={inputBg} p={3} borderRadius="md" maxH="200px" overflowY="auto">
                {Array.from(changedFields).map(field => (
                  <HStack key={field} fontSize="sm" py={1}>
                    <Icon as={FiCheck} color="green.500" />
                    <Text>{field.replace(/_/g, ' ')}</Text>
                  </HStack>
                ))}
              </Box>
              <Alert status="warning" size="sm">
                <AlertIcon />
                <Text fontSize="xs">
                  As alterações serão enviadas via TR-069 e podem levar alguns segundos
                  para serem aplicadas no dispositivo.
                </Text>
              </Alert>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={onConfirmClose}>
              Cancelar
            </Button>
            <Button colorScheme="blue" onClick={confirmSave} isLoading={saving}>
              Confirmar e Salvar
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </VStack>
  );
};

export default QuickConfig;
