// Componente para exibir informações GPON/PON de ONTs
import { Box, Text, Grid, GridItem, Badge, Divider } from "@chakra-ui/react";

interface GPONInfoProps {
  device: any;
}

// Helper para extrair valor
function getValue(obj: any, path: string[], fallback: any = "—"): any {
  try {
    const value = path.reduce((acc: any, key: string) => {
      if (acc && typeof acc === 'object' && key in acc) {
        return acc[key];
      }
      return undefined;
    }, obj);
    
    if (value === undefined || value === null) return fallback;
    if (typeof value === 'object' && '_value' in value) return value._value ?? fallback;
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

export function GPONInfo({ device }: GPONInfoProps) {
  if (!device) return null;
  
  const dev = device.Device || {};
  
  // Verificar se tem informações GPON
  const hasOptical = 'Optical' in dev;
  const hasGPON = 'X_ZYXEL_GPON' in dev;
  
  if (!hasOptical && !hasGPON) {
    return (
      <Box bg="orange.900" p={4} borderRadius="md" border="1px solid" borderColor="orange.600">
        <Text color="orange.200" fontSize="sm">
          ℹ️ Este dispositivo não possui informações GPON/Optical disponíveis.
        </Text>
      </Box>
    );
  }
  
  // Optical Interface (padrão TR-181)
  const opticalStatus = String(getValue(dev, ['Optical', 'Interface', '1', 'Status'], 'Down'));
  const opticalName = String(getValue(dev, ['Optical', 'Interface', '1', 'Name'], '—'));
  const rxPower = String(getValue(dev, ['Optical', 'Interface', '1', 'OpticalSignalLevel'], '—'));
  const txPower = String(getValue(dev, ['Optical', 'Interface', '1', 'TransmitOpticalLevel'], '—'));
  const lowerThreshold = String(getValue(dev, ['Optical', 'Interface', '1', 'LowerOpticalThreshold'], '—'));
  const upperThreshold = String(getValue(dev, ['Optical', 'Interface', '1', 'UpperOpticalThreshold'], '—'));
  
  // GPON Vendor Specific (Zyxel)
  const gpon = dev.X_ZYXEL_GPON || {};
  const olt = gpon.OLT || {};
  const onu = gpon.ONU || {};
  const linkCfg = gpon.LinkCfg || {};
  const loidAuth = gpon.LOIDAuth || {};
  const xpon = gpon.Xpon || {};
  
  // Dados da OLT
  const oltVendorId = String(getValue(olt, ['VendorId'], '—'));
  const oltEquipmentId = String(getValue(olt, ['EquipmentId'], '—'));
  const oltVersion = String(getValue(olt, ['Version'], '—'));
  
  // Dados da ONU
  const onuEquipmentId = String(getValue(onu, ['EquipmentId'], '—'));
  const onuModelName = String(getValue(onu, ['ModelName'], '—'));
  const onuOperationalState = String(getValue(onu, ['OperationalState'], '—'));
  
  // Status do Link
  const linkState = String(getValue(linkCfg, ['LinkState'], '0'));
  
  // LOID Authentication
  const loid = String(getValue(loidAuth, ['LOID'], '—'));
  const loidAuthStatus = String(getValue(loidAuth, ['AuthStatus'], '0'));
  
  // Xpon Status
  const phyStatus = String(getValue(xpon, ['phyStatus'], '—'));
  const trafficStatus = String(getValue(xpon, ['trafficStatus'], '—'));
  
  // Parse PhyTransParameters (contém RX/TX power)
  const phyTransParams = String(getValue(gpon, ['ANI', 'PhyTransParameters'], ''));
  let temperature = '—', voltage = '—', txCurrent = '—', rxPowerHex = '—', txPowerHex = '—';
  
  if (phyTransParams) {
    const parts = phyTransParams.split(',');
    parts.forEach(part => {
      if (part.startsWith('Temperature:')) temperature = part.split(':')[1];
      if (part.startsWith('Voltage:')) voltage = part.split(':')[1];
      if (part.startsWith('TxCurrent:')) txCurrent = part.split(':')[1];
      if (part.startsWith('TxPower:')) txPowerHex = part.split(':')[1];
      if (part.startsWith('RxPower:')) rxPowerHex = part.split(':')[1];
    });
  }
  
  // Conversões Zyxel GPON (baseado em dados reais):
  // - RxPower/TxPower: valor em 0.0001 mW, converter para dBm: 10 * log10(hex / 10000)
  // - Temperature: unsigned 16-bit / 256 = °C
  // - Voltage: unsigned 16-bit / 10000 = V
  
  const convertPowerToDbm = (hex: string): string => {
    if (!hex || hex === '—' || hex.length === 0) return '—';
    try {
      const val = parseInt(hex, 16);
      if (val <= 0) return '—';
      // Valor em 0.0001 mW, converter para dBm
      const mw = val / 10000;
      const dbm = 10 * Math.log10(mw);
      return dbm.toFixed(2);
    } catch {
      return '—';
    }
  };
  
  const convertTemperature = (hex: string): string => {
    if (!hex || hex === '—' || hex.length === 0) return '—';
    try {
      const val = parseInt(hex, 16);
      const celsius = val / 256;
      return celsius.toFixed(2);
    } catch {
      return '—';
    }
  };
  
  const convertVoltage = (hex: string): string => {
    if (!hex || hex === '—' || hex.length === 0) return '—';
    try {
      const val = parseInt(hex, 16);
      const volts = val / 10000;
      return volts.toFixed(2);
    } catch {
      return '—';
    }
  };
  
  const rxPowerDbm = convertPowerToDbm(rxPowerHex);
  const txPowerDbm = convertPowerToDbm(txPowerHex);
  const temperatureC = convertTemperature(temperature);
  const voltageV = convertVoltage(voltage);
  
  // Determinar cor do status RX Power
  const getRxPowerColor = (power: string): string => {
    if (power === '—') return 'gray';
    const val = parseFloat(power);
    if (val >= -8) return 'red';      // Muito alto
    if (val >= -25) return 'green';   // Bom
    if (val >= -28) return 'yellow';  // Aceitável
    return 'red';                     // Muito baixo
  };
  
  const isOnline = opticalStatus === 'Up' || linkState === '1';
  
  return (
    <Box>
      {/* Header Status */}
      <Box 
        bg={isOnline ? 'green.900' : 'red.900'} 
        p={4} 
        borderRadius="lg" 
        border="2px solid" 
        borderColor={isOnline ? 'green.500' : 'red.500'}
        mb={4}
      >
        <Grid templateColumns="repeat(3, 1fr)" gap={4}>
          <GridItem>
            <Text color={isOnline ? 'green.300' : 'red.300'} fontSize="xs" fontWeight="semibold">
              STATUS ÓPTICO
            </Text>
            <Text color="white" fontSize="2xl" fontWeight="bold">
              {opticalStatus}
            </Text>
          </GridItem>
          <GridItem>
            <Text color="cyan.300" fontSize="xs" fontWeight="semibold">
              LINK STATE
            </Text>
            <Text color="white" fontSize="2xl" fontWeight="bold">
              {linkState === '1' ? 'Conectado' : 'Desconectado'}
            </Text>
          </GridItem>
          <GridItem>
            <Text color="purple.300" fontSize="xs" fontWeight="semibold">
              STATUS TRÁFEGO
            </Text>
            <Text color="white" fontSize="2xl" fontWeight="bold">
              {trafficStatus}
            </Text>
          </GridItem>
        </Grid>
      </Box>
      
      {/* Potências Ópticas */}
      <Grid templateColumns={{base: '1fr', md: 'repeat(2, 1fr)'}} gap={4} mb={4}>
        <GridItem>
          <Box bg={`${getRxPowerColor(rxPowerDbm)}.900`} p={4} borderRadius="lg" border="2px solid" borderColor={`${getRxPowerColor(rxPowerDbm)}.600`}>
            <Text color={`${getRxPowerColor(rxPowerDbm)}.300`} fontSize="xs" fontWeight="bold" mb={1}>
              ⬇️ RX POWER (Recepção)
            </Text>
            <Text color="white" fontSize="3xl" fontWeight="bold">
              {rxPowerDbm !== '—' ? `${rxPowerDbm} dBm` : rxPower}
            </Text>
            <Text color={`${getRxPowerColor(rxPowerDbm)}.200`} fontSize="xs" mt={1}>
              Limites: {lowerThreshold} ~ {upperThreshold} dBm
            </Text>
          </Box>
        </GridItem>
        
        <GridItem>
          <Box bg="blue.900" p={4} borderRadius="lg" border="2px solid" borderColor="blue.600">
            <Text color="blue.300" fontSize="xs" fontWeight="bold" mb={1}>
              ⬆️ TX POWER (Transmissão)
            </Text>
            <Text color="white" fontSize="3xl" fontWeight="bold">
              {txPowerDbm !== '—' ? `${txPowerDbm} dBm` : txPower}
            </Text>
            <Text color="blue.200" fontSize="xs" mt={1}>
              Potência de transmissão para OLT
            </Text>
          </Box>
        </GridItem>
      </Grid>
      
      <Divider my={4} borderColor="whiteAlpha.300" />
      
      {/* Informações da ONU */}
      <Box mb={4}>
        <Text color="cyan.400" fontSize="sm" fontWeight="bold" mb={3} textTransform="uppercase">
          📡 Informações da ONU
        </Text>
        <Grid templateColumns={{base: '1fr', md: 'repeat(2, 1fr)'}} gap={3}>
          <Box bg="whiteAlpha.50" p={3} borderRadius="md">
            <Text color="gray.400" fontSize="xs">Equipment ID</Text>
            <Text color="white" fontWeight="medium">{onuEquipmentId}</Text>
          </Box>
          <Box bg="whiteAlpha.50" p={3} borderRadius="md">
            <Text color="gray.400" fontSize="xs">Model Name</Text>
            <Text color="white" fontWeight="medium">{onuModelName}</Text>
          </Box>
          <Box bg="whiteAlpha.50" p={3} borderRadius="md">
            <Text color="gray.400" fontSize="xs">Interface Name</Text>
            <Text color="white" fontWeight="medium">{opticalName}</Text>
          </Box>
          <Box bg="whiteAlpha.50" p={3} borderRadius="md">
            <Text color="gray.400" fontSize="xs">Operational State</Text>
            <Badge colorScheme={onuOperationalState === 'Enabled' ? 'green' : 'gray'}>
              {onuOperationalState || 'Unknown'}
            </Badge>
          </Box>
        </Grid>
      </Box>
      
      {/* Informações da OLT */}
      {(oltVendorId !== '—' || oltEquipmentId !== '—') && (
        <Box mb={4}>
          <Text color="orange.400" fontSize="sm" fontWeight="bold" mb={3} textTransform="uppercase">
            🏢 Informações da OLT
          </Text>
          <Grid templateColumns={{base: '1fr', md: 'repeat(3, 1fr)'}} gap={3}>
            <Box bg="whiteAlpha.50" p={3} borderRadius="md">
              <Text color="gray.400" fontSize="xs">Vendor ID</Text>
              <Text color="white" fontWeight="medium">{oltVendorId}</Text>
            </Box>
            <Box bg="whiteAlpha.50" p={3} borderRadius="md">
              <Text color="gray.400" fontSize="xs">Equipment ID</Text>
              <Text color="white" fontWeight="medium">{oltEquipmentId}</Text>
            </Box>
            <Box bg="whiteAlpha.50" p={3} borderRadius="md">
              <Text color="gray.400" fontSize="xs">Version</Text>
              <Text color="white" fontWeight="medium">{oltVersion}</Text>
            </Box>
          </Grid>
        </Box>
      )}
      
      {/* LOID Authentication */}
      {loid !== '—' && (
        <Box mb={4}>
          <Text color="purple.400" fontSize="sm" fontWeight="bold" mb={3} textTransform="uppercase">
            🔐 LOID Authentication
          </Text>
          <Grid templateColumns={{base: '1fr', md: 'repeat(2, 1fr)'}} gap={3}>
            <Box bg="whiteAlpha.50" p={3} borderRadius="md">
              <Text color="gray.400" fontSize="xs">LOID</Text>
              <Text color="white" fontWeight="medium" fontFamily="mono">{loid}</Text>
            </Box>
            <Box bg="whiteAlpha.50" p={3} borderRadius="md">
              <Text color="gray.400" fontSize="xs">Auth Status</Text>
              <Badge colorScheme={loidAuthStatus === '1' ? 'green' : 'red'}>
                {loidAuthStatus === '1' ? 'Authenticated' : 'Not Authenticated'}
              </Badge>
            </Box>
          </Grid>
        </Box>
      )}
      
      {/* Parâmetros Físicos */}
      {temperature !== '—' && (
        <Box>
          <Text color="teal.400" fontSize="sm" fontWeight="bold" mb={3} textTransform="uppercase">
            🌡️ Parâmetros Físicos
          </Text>
          <Grid templateColumns={{base: '1fr', md: 'repeat(4, 1fr)'}} gap={3}>
            <Box bg="teal.900" p={3} borderRadius="md" textAlign="center">
              <Text color="teal.200" fontSize="xs">Temperatura</Text>
              <Text color="white" fontWeight="bold">{temperatureC}°C</Text>
              <Text color="teal.400" fontSize="xs" fontFamily="mono">({temperature})</Text>
            </Box>
            <Box bg="yellow.900" p={3} borderRadius="md" textAlign="center">
              <Text color="yellow.200" fontSize="xs">Voltagem</Text>
              <Text color="white" fontWeight="bold">{voltageV}V</Text>
              <Text color="yellow.400" fontSize="xs" fontFamily="mono">({voltage})</Text>
            </Box>
            <Box bg="orange.900" p={3} borderRadius="md" textAlign="center">
              <Text color="orange.200" fontSize="xs">TX Current</Text>
              <Text color="white" fontWeight="bold" fontFamily="mono">{txCurrent}</Text>
            </Box>
            <Box bg="cyan.900" p={3} borderRadius="md" textAlign="center">
              <Text color="cyan.200" fontSize="xs">Phy Status</Text>
              <Badge colorScheme={phyStatus === 'up' ? 'green' : 'red'} fontSize="md">
                {phyStatus}
              </Badge>
            </Box>
          </Grid>
        </Box>
      )}
    </Box>
  );
}
