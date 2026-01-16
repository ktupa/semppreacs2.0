# Suporte Multi-Modelo TR-098 e TR-181

Este documento descreve como configurar o sistema SEMPPRE Bridge para suportar tanto dispositivos TR-098 (InternetGatewayDevice) quanto TR-181 (Device).

## Dispositivos Suportados

### TR-098 (InternetGatewayDevice.*)
- TP-Link EC220-G5 v1/v2
- ZTE F670L, F680
- Huawei HG8245H, EG8145V5
- D-Link DIR-615
- Intelbras Action

### TR-181 (Device.*)
- **Zyxel** PX3321-T1, PMG2005-T20B, EMG5523-T50B, VMG3925-B10C
- **TP-Link** EC220-G5 v3.0 (OUI: 482254 com firmware novo)
- Outros dispositivos modernos

## Instalação dos Provisions no GenieACS

### Método 1: Via Script (Recomendado)

```bash
cd /opt/semppre-bridge/data/genieacs
chmod +x import-genieacs-config.sh
./import-genieacs-config.sh
```

### Método 2: Via GenieACS UI

1. Acesse a interface web do GenieACS (normalmente http://localhost:3000)
2. Vá em **Admin** > **Provisions**
3. Clique em **New** e cole o conteúdo de cada arquivo:
   - `provisions/tr181-provision.js`
   - `provisions/multi-brand-provision.js`
4. Vá em **Admin** > **Presets**
5. Crie os presets com as seguintes configurações:

#### Preset para Zyxel (TR-181)
```json
{
  "weight": 100,
  "channel": "bootstrap",
  "events": {"0 BOOTSTRAP": true, "1 BOOT": true, "2 PERIODIC": true, "6 CONNECTION REQUEST": true},
  "precondition": "Device.DeviceInfo.Manufacturer LIKE Zyxel",
  "configurations": [{"type": "provision", "name": "tr181-provision"}]
}
```

#### Preset para TP-Link TR-181
```json
{
  "weight": 100,
  "channel": "bootstrap", 
  "events": {"0 BOOTSTRAP": true, "1 BOOT": true, "2 PERIODIC": true},
  "precondition": "_deviceId._OUI = 482254 AND Device.DeviceInfo.Manufacturer EXISTS",
  "configurations": [{"type": "provision", "name": "tr181-provision"}]
}
```

#### Preset Universal (Fallback)
```json
{
  "weight": 50,
  "channel": "default",
  "events": {"0 BOOTSTRAP": true, "1 BOOT": true, "2 PERIODIC": true},
  "precondition": "",
  "configurations": [{"type": "provision", "name": "multi-brand-provision"}]
}
```

### Método 3: Via API curl

```bash
# Provision TR-181
curl -X PUT "http://localhost:7557/provisions/tr181-provision" \
    -H "Content-Type: text/plain" \
    --data-binary @provisions/tr181-provision.js

# Provision Multi-Brand
curl -X PUT "http://localhost:7557/provisions/multi-brand-provision" \
    -H "Content-Type: text/plain" \
    --data-binary @provisions/multi-brand-provision.js

# Preset Zyxel
curl -X PUT "http://localhost:7557/presets/preset-zyxel-tr181" \
    -H "Content-Type: application/json" \
    -d '{"weight":100,"channel":"bootstrap","events":{"0 BOOTSTRAP":true},"precondition":"{\"Device.DeviceInfo.Manufacturer\":{\"$regex\":\"Zyxel\"}}","configurations":[{"type":"provision","name":"tr181-provision"}]}'
```

## Forçar Refresh de Dispositivos

Após importar os provisions, force um refresh nos dispositivos para coletar os novos parâmetros:

```bash
# Refresh de um dispositivo específico
curl -X POST "http://localhost:7557/devices/DEVICE_ID/tasks" \
    -H "Content-Type: application/json" \
    -d '{"name":"refreshObject","objectName":"Device"}'

# Refresh de todos os dispositivos Zyxel
curl -X POST "http://localhost:7557/devices?query={\"Device.DeviceInfo.Manufacturer\":{\"$regex\":\"Zyxel\"}}" \
    -H "Content-Type: application/json" \
    -d '{"name":"refreshObject","objectName":"Device"}'
```

## Mapeamento de Parâmetros

### WAN/PPP
| Parâmetro | TR-098 | TR-181 (Zyxel) |
|-----------|--------|----------------|
| WAN IP | WANPPPConnection.1.ExternalIPAddress | PPP.Interface.2.IPCP.LocalIPAddress |
| Status | WANPPPConnection.1.ConnectionStatus | PPP.Interface.2.Status |
| Username | WANPPPConnection.1.Username | PPP.Interface.2.Username |
| Gateway | WANPPPConnection.1.DefaultGateway | PPP.Interface.2.IPCP.RemoteIPAddress |

### WiFi
| Parâmetro | TR-098 | TR-181 |
|-----------|--------|--------|
| SSID 2.4GHz | WLANConfiguration.1.SSID | WiFi.SSID.1.SSID |
| SSID 5GHz | WLANConfiguration.2/5.SSID | WiFi.SSID.2/3.SSID |
| Channel | WLANConfiguration.X.Channel | WiFi.Radio.X.Channel |
| Security | WLANConfiguration.X.BeaconType | WiFi.AccessPoint.X.Security.ModeEnabled |
| Password | WLANConfiguration.X.PreSharedKey | WiFi.AccessPoint.X.Security.KeyPassphrase |

### LAN/DHCP
| Parâmetro | TR-098 | TR-181 |
|-----------|--------|--------|
| LAN IP | LANHostConfigManagement.IPRouters | IP.Interface.4.IPv4Address.1.IPAddress |
| DHCP Enable | LANHostConfigManagement.DHCPServerEnable | DHCPv4.Server.Enable |
| DHCP Start | LANHostConfigManagement.MinAddress | DHCPv4.Server.Pool.1.MinAddress |

## Troubleshooting

### Dispositivo aparece "Offline" mas está comunicando
Verifique se o dispositivo usa TR-181 mas os paths TR-098 estão sendo consultados.
Solução: Importe o provision tr181-provision.js e force um refresh.

### Parâmetros WiFi não aparecem
Para dispositivos Zyxel, o WiFi 5GHz pode estar em:
- `Device.WiFi.SSID.2` ou `Device.WiFi.SSID.3`
- `Device.WiFi.Radio.2` ou `Device.WiFi.Radio.3`

### Clientes WiFi não aparecem
Force refresh do objeto WiFi:
```bash
curl -X POST "http://localhost:7557/devices/DEVICE_ID/tasks" \
    -H "Content-Type: application/json" \
    -d '{"name":"refreshObject","objectName":"Device.WiFi"}'
```

## Verificar Modelo do Dispositivo

Para verificar se um dispositivo usa TR-098 ou TR-181:

```bash
# Buscar dispositivo
curl -s "http://localhost:7557/devices/DEVICE_ID" | jq '.Device.DeviceInfo.Manufacturer'

# Se retornar valor, é TR-181
# Se retornar null, verifique:
curl -s "http://localhost:7557/devices/DEVICE_ID" | jq '.InternetGatewayDevice.DeviceInfo.Manufacturer'
```

## Arquivos do Projeto

```
data/genieacs/
├── import-genieacs-config.sh      # Script de importação
├── provisions/
│   ├── tr181-provision.js         # Provision para dispositivos TR-181
│   └── multi-brand-provision.js   # Provision universal (TR-098 + TR-181)
├── presets/
│   ├── preset-zyxel-tr181.json    # Preset para Zyxel
│   ├── preset-tplink-tr181.json   # Preset para TP-Link TR-181
│   └── preset-multi-brand-universal.json  # Preset universal
└── README.md                      # Este arquivo
```
