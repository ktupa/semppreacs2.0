# 📱 Semppre Bridge - API Mobile

## Documentação para Integração com Aplicativo Mobile

Esta API permite que aplicativos móveis gerenciem configurações WiFi dos dispositivos TR-069.

---

## 🔐 Autenticação

A API usa autenticação por **API Key** enviada no header HTTP.

### Header de Autenticação
```
X-API-Key: seu-token-aqui
```

### Configuração do Token

O token é configurado no servidor através da variável de ambiente:
```bash
MOBILE_API_TOKEN=semppre-mobile-dev-token-2025
```

**Token de desenvolvimento (padrão):** `semppre-mobile-dev-token-2025`

> ⚠️ **IMPORTANTE:** Em produção, SEMPRE configure um token forte e único!

---

## 📍 Base URL

```
http://SEU_SERVIDOR:8087/api/mobile
```

Exemplo: `http://138.117.248.205:8087/api/mobile`

---

## 🔌 Endpoints

### 1. Verificar Status da API

Verifica se a API está online. **NÃO requer autenticação**.

```http
GET /api/mobile/status
```

**Resposta:**
```json
{
  "status": "online",
  "version": "1.0.0",
  "timestamp": "2026-01-16T12:00:00.000000"
}
```

---

### 2. Buscar Dispositivo por Login/Serial

Busca um dispositivo pelo login PPPoE ou número de série.

```http
GET /api/mobile/device/search?login={login_ou_serial}
```

**Headers:**
```
X-API-Key: seu-token-aqui
```

**Parâmetros:**
- `login` (obrigatório): Login PPPoE do cliente ou SerialNumber do dispositivo

**Exemplo:**
```bash
curl -X GET "http://138.117.248.205:8087/api/mobile/device/search?login=ELENICEQD11L7" \
  -H "X-API-Key: semppre-mobile-dev-token-2025"
```

**Resposta de Sucesso:**
```json
{
  "found": true,
  "device_id": "482254-EC220%252DG5-222C8S0001318",
  "login": "ELENICEQD11L7",
  "serial": "222C8S0001318",
  "model": "EC220-G5",
  "manufacturer": "TP-Link",
  "firmware": "1.0.2",
  "online": true,
  "last_inform": "2026-01-16T12:00:00.000000",
  "ip_address": "100.64.10.25",
  "temperature": 45.5,
  "optical_signal": {
    "rx_power": -18.5,
    "tx_power": 2.3,
    "status": "Up"
  },
  "uptime": 86400,
  "wifi_2g": {
    "enabled": true,
    "ssid": "MinhaRede_2G",
    "channel": 6,
    "hidden": false,
    "visible": true,
    "password": null
  },
  "wifi_5g": {
    "enabled": true,
    "ssid": "MinhaRede_5G",
    "channel": 36,
    "hidden": false,
    "visible": true,
    "password": null
  }
}
```

**Campos da Resposta:**

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `found` | boolean | Se o dispositivo foi encontrado |
| `device_id` | string | ID único do dispositivo no ACS |
| `login` | string | Login PPPoE do cliente |
| `serial` | string | Número de série do dispositivo |
| `model` | string | Modelo do equipamento |
| `manufacturer` | string | Fabricante |
| `firmware` | string | Versão do firmware |
| `online` | boolean | Se o dispositivo está online (inform < 5 min) |
| `last_inform` | string | Data/hora do último inform (ISO 8601) |
| `ip_address` | string | Endereço IP do dispositivo |
| `temperature` | float | Temperatura em Celsius (quando disponível) |
| `optical_signal` | object | Informações do sinal óptico GPON/EPON |
| `optical_signal.rx_power` | float | Potência de recepção em dBm |
| `optical_signal.tx_power` | float | Potência de transmissão em dBm |
| `optical_signal.status` | string | Status da conexão óptica (Up/Down) |
| `uptime` | int | Tempo de atividade em segundos |
| `wifi_2g` | object | Configurações WiFi 2.4GHz |
| `wifi_5g` | object | Configurações WiFi 5GHz |

**Campos do WiFi (wifi_2g / wifi_5g):**

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `enabled` | boolean | Se a rede está **ativa** (ligada/desligada) |
| `ssid` | string | Nome da rede WiFi |
| `channel` | int | Canal utilizado (0 = automático) |
| `hidden` | boolean | Se a rede está **oculta** (SSID não transmitido) |
| `visible` | boolean | Se a rede está **visível** (SSID transmitido) |
| `password` | string | Sempre null (senha não é retornada por segurança) |

**Resposta - Dispositivo Não Encontrado:**
```json
{
  "found": false,
  "device_id": null,
  "login": "cliente123",
  "serial": null
}
```

---

### 3. Configurar WiFi

Altera configurações WiFi do dispositivo.

```http
POST /api/mobile/wifi/configure
```

**Headers:**
```
X-API-Key: seu-token-aqui
Content-Type: application/json
```

**Body (JSON):**
```json
{
  "login": "cliente123",
  "wifi_2g_ssid": "MinhaNovaRede",
  "wifi_2g_password": "senha12345",
  "wifi_2g_channel": 0,
  "wifi_5g_ssid": "MinhaNovaRede_5G",
  "wifi_5g_password": "senha12345"
}
```

**Parâmetros do Body:**

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `login` | string | ✅ Sim | Login PPPoE ou Serial do dispositivo |
| `wifi_2g_enabled` | boolean | Não | Habilitar/desabilitar WiFi 2.4GHz |
| `wifi_2g_ssid` | string | Não | Nome da rede 2.4GHz (1-32 caracteres) |
| `wifi_2g_password` | string | Não | Senha WiFi 2.4GHz (mín. 8 caracteres) |
| `wifi_2g_channel` | integer | Não | Canal 2.4GHz (0=auto, 1-14) |
| `wifi_2g_hidden` | boolean | Não | Ocultar SSID 2.4GHz |
| `wifi_5g_enabled` | boolean | Não | Habilitar/desabilitar WiFi 5GHz |
| `wifi_5g_ssid` | string | Não | Nome da rede 5GHz (1-32 caracteres) |
| `wifi_5g_password` | string | Não | Senha WiFi 5GHz (mín. 8 caracteres) |
| `wifi_5g_channel` | integer | Não | Canal 5GHz (0=auto, 36-165) |
| `wifi_5g_hidden` | boolean | Não | Ocultar SSID 5GHz |

**Exemplo cURL:**
```bash
curl -X POST "http://138.117.248.205:8087/api/mobile/wifi/configure" \
  -H "X-API-Key: semppre-mobile-dev-token-2025" \
  -H "Content-Type: application/json" \
  -d '{
    "login": "cliente123",
    "wifi_2g_ssid": "MinhaNovaRede",
    "wifi_2g_password": "senha12345"
  }'
```

**Resposta de Sucesso:**
```json
{
  "success": true,
  "device_id": "482254-EC220%252DG5-222C8S0001318",
  "message": "Configuração WiFi enviada com sucesso. As alterações serão aplicadas em breve.",
  "parameters_changed": 2,
  "task_id": "65a1b2c3d4e5f6789"
}
```

---

### 4. Obter WiFi de Dispositivo Específico

```http
GET /api/mobile/device/{device_id}/wifi
```

**Headers:**
```
X-API-Key: seu-token-aqui
```

**Exemplo:**
```bash
curl -X GET "http://138.117.248.205:8087/api/mobile/device/482254-EC220%252DG5-222C8S0001318/wifi" \
  -H "X-API-Key: semppre-mobile-dev-token-2025"
```

---

### 5. Reiniciar Dispositivo

```http
POST /api/mobile/device/{device_id}/reboot
```

**Headers:**
```
X-API-Key: seu-token-aqui
```

**Resposta:**
```json
{
  "success": true,
  "device_id": "482254-EC220%252DG5-222C8S0001318",
  "message": "Comando de reinicialização enviado. O dispositivo será reiniciado em breve."
}
```

---

### 6. Forçar Atualização de Parâmetros

```http
POST /api/mobile/device/{device_id}/refresh
```

**Headers:**
```
X-API-Key: seu-token-aqui
```

**Resposta:**
```json
{
  "success": true,
  "device_id": "482254-EC220%252DG5-222C8S0001318",
  "message": "Refresh solicitado. Os parâmetros serão atualizados em breve."
}
```

---

## 🚀 Implementação no App Mobile

### Flutter/Dart

```dart
import 'dart:convert';
import 'package:http/http.dart' as http;

// Models
class WifiInfo {
  final bool enabled;
  final String? ssid;
  final int? channel;
  final bool hidden;
  final bool visible;
  
  WifiInfo({
    required this.enabled,
    this.ssid,
    this.channel,
    required this.hidden,
    required this.visible,
  });
  
  factory WifiInfo.fromJson(Map<String, dynamic>? json) {
    if (json == null) return WifiInfo(enabled: false, hidden: false, visible: false);
    return WifiInfo(
      enabled: json['enabled'] ?? false,
      ssid: json['ssid'],
      channel: json['channel'],
      hidden: json['hidden'] ?? false,
      visible: json['visible'] ?? true,
    );
  }
  
  String get statusText => enabled ? 'Ativa' : 'Desativada';
  String get visibilityText => visible ? 'Visível' : 'Oculta';
}

class OpticalSignal {
  final double? rxPower;
  final double? txPower;
  final String? status;
  
  OpticalSignal({this.rxPower, this.txPower, this.status});
  
  factory OpticalSignal.fromJson(Map<String, dynamic>? json) {
    if (json == null) return OpticalSignal();
    return OpticalSignal(
      rxPower: json['rx_power']?.toDouble(),
      txPower: json['tx_power']?.toDouble(),
      status: json['status'],
    );
  }
  
  bool get isOnline => status?.toLowerCase() == 'up';
}

class Device {
  final String deviceId;
  final String? login;
  final String? serial;
  final String? model;
  final String? manufacturer;
  final bool online;
  final double? temperature;
  final OpticalSignal? opticalSignal;
  final int? uptime;
  final WifiInfo wifi2g;
  final WifiInfo wifi5g;
  
  Device({
    required this.deviceId,
    this.login,
    this.serial,
    this.model,
    this.manufacturer,
    required this.online,
    this.temperature,
    this.opticalSignal,
    this.uptime,
    required this.wifi2g,
    required this.wifi5g,
  });
  
  factory Device.fromJson(Map<String, dynamic> json) {
    return Device(
      deviceId: json['device_id'] ?? '',
      login: json['login'],
      serial: json['serial'],
      model: json['model'],
      manufacturer: json['manufacturer'],
      online: json['online'] ?? false,
      temperature: json['temperature']?.toDouble(),
      opticalSignal: OpticalSignal.fromJson(json['optical_signal']),
      uptime: json['uptime'],
      wifi2g: WifiInfo.fromJson(json['wifi_2g']),
      wifi5g: WifiInfo.fromJson(json['wifi_5g']),
    );
  }
  
  String get uptimeFormatted {
    if (uptime == null) return 'N/A';
    final hours = uptime! ~/ 3600;
    final minutes = (uptime! % 3600) ~/ 60;
    return '${hours}h ${minutes}m';
  }
}

class SemppeBridgeApi {
  final String baseUrl;
  final String apiKey;
  
  SemppeBridgeApi({
    required this.baseUrl,
    required this.apiKey,
  });
  
  Map<String, String> get _headers => {
    'X-API-Key': apiKey,
    'Content-Type': 'application/json',
  };
  
  /// Busca dispositivo por login PPPoE ou serial
  Future<Map<String, dynamic>> searchDevice(String login) async {
    final response = await http.get(
      Uri.parse('$baseUrl/api/mobile/device/search?login=$login'),
      headers: _headers,
    );
    
    if (response.statusCode == 200) {
      return json.decode(response.body);
    } else if (response.statusCode == 401) {
      throw Exception('Token de API inválido');
    } else {
      throw Exception('Erro ao buscar dispositivo: ${response.statusCode}');
    }
  }
  
  /// Configura WiFi do dispositivo
  Future<Map<String, dynamic>> configureWifi({
    required String login,
    String? wifi2gSsid,
    String? wifi2gPassword,
    int? wifi2gChannel,
    bool? wifi2gHidden,
    String? wifi5gSsid,
    String? wifi5gPassword,
    int? wifi5gChannel,
    bool? wifi5gHidden,
  }) async {
    final body = {
      'login': login,
      if (wifi2gSsid != null) 'wifi_2g_ssid': wifi2gSsid,
      if (wifi2gPassword != null) 'wifi_2g_password': wifi2gPassword,
      if (wifi2gChannel != null) 'wifi_2g_channel': wifi2gChannel,
      if (wifi2gHidden != null) 'wifi_2g_hidden': wifi2gHidden,
      if (wifi5gSsid != null) 'wifi_5g_ssid': wifi5gSsid,
      if (wifi5gPassword != null) 'wifi_5g_password': wifi5gPassword,
      if (wifi5gChannel != null) 'wifi_5g_channel': wifi5gChannel,
      if (wifi5gHidden != null) 'wifi_5g_hidden': wifi5gHidden,
    };
    
    final response = await http.post(
      Uri.parse('$baseUrl/api/mobile/wifi/configure'),
      headers: _headers,
      body: json.encode(body),
    );
    
    if (response.statusCode == 200) {
      return json.decode(response.body);
    } else if (response.statusCode == 401) {
      throw Exception('Token de API inválido');
    } else if (response.statusCode == 404) {
      throw Exception('Dispositivo não encontrado');
    } else {
      throw Exception('Erro ao configurar WiFi: ${response.statusCode}');
    }
  }
  
  /// Reinicia o dispositivo
  Future<Map<String, dynamic>> rebootDevice(String deviceId) async {
    final response = await http.post(
      Uri.parse('$baseUrl/api/mobile/device/$deviceId/reboot'),
      headers: _headers,
    );
    
    if (response.statusCode == 200) {
      return json.decode(response.body);
    } else {
      throw Exception('Erro ao reiniciar: ${response.statusCode}');
    }
  }
}

// Uso:
void main() async {
  final api = SemppeBridgeApi(
    baseUrl: 'http://138.117.248.205:8087',
    apiKey: 'semppre-mobile-dev-token-2025',
  );
  
  // Buscar dispositivo e converter para Model
  final json = await api.searchDevice('cliente123');
  final device = Device.fromJson(json);
  
  // Exibir informações
  print('Modelo: ${device.model}');
  print('Online: ${device.online}');
  print('Uptime: ${device.uptimeFormatted}');
  print('Temperatura: ${device.temperature ?? "N/A"}°C');
  print('Sinal Óptico: ${device.opticalSignal?.rxPower ?? "N/A"} dBm');
  
  // Status das redes WiFi
  print('WiFi 2.4G: ${device.wifi2g.ssid} - ${device.wifi2g.statusText} - ${device.wifi2g.visibilityText}');
  print('WiFi 5G: ${device.wifi5g.ssid} - ${device.wifi5g.statusText} - ${device.wifi5g.visibilityText}');
  
  // Alterar WiFi
  final result = await api.configureWifi(
    login: 'cliente123',
    wifi2gSsid: 'NovaRede',
    wifi2gPassword: 'novaSenha123',
  );
  print('Sucesso: ${result['success']}');
}
```

---

### React Native / JavaScript

```javascript
class SemppeBridgeApi {
  constructor(baseUrl, apiKey) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }
  
  get headers() {
    return {
      'X-API-Key': this.apiKey,
      'Content-Type': 'application/json',
    };
  }
  
  async searchDevice(login) {
    const response = await fetch(
      `${this.baseUrl}/api/mobile/device/search?login=${encodeURIComponent(login)}`,
      { headers: this.headers }
    );
    
    if (!response.ok) {
      if (response.status === 401) throw new Error('Token inválido');
      throw new Error(`Erro: ${response.status}`);
    }
    
    return response.json();
  }
  
  async configureWifi(config) {
    const response = await fetch(
      `${this.baseUrl}/api/mobile/wifi/configure`,
      {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(config),
      }
    );
    
    if (!response.ok) {
      if (response.status === 401) throw new Error('Token inválido');
      if (response.status === 404) throw new Error('Dispositivo não encontrado');
      throw new Error(`Erro: ${response.status}`);
    }
    
    return response.json();
  }
  
  async rebootDevice(deviceId) {
    const response = await fetch(
      `${this.baseUrl}/api/mobile/device/${encodeURIComponent(deviceId)}/reboot`,
      {
        method: 'POST',
        headers: this.headers,
      }
    );
    
    return response.json();
  }
}

// Uso:
const api = new SemppeBridgeApi(
  'http://138.117.248.205:8087',
  'semppre-mobile-dev-token-2025'
);

// Buscar dispositivo
const device = await api.searchDevice('cliente123');

// Status geral
console.log('Modelo:', device.model);
console.log('Online:', device.online);
console.log('Uptime:', device.uptime, 'segundos');
console.log('Temperatura:', device.temperature, '°C');

// Sinal óptico
if (device.optical_signal) {
  console.log('RX Power:', device.optical_signal.rx_power, 'dBm');
  console.log('TX Power:', device.optical_signal.tx_power, 'dBm');
  console.log('Status Óptico:', device.optical_signal.status);
}

// WiFi 2.4GHz
console.log('WiFi 2.4G:', {
  ssid: device.wifi_2g?.ssid,
  ativo: device.wifi_2g?.enabled ? 'Sim' : 'Não',
  visivel: device.wifi_2g?.visible ? 'Sim' : 'Não',
  canal: device.wifi_2g?.channel
});

// WiFi 5GHz
console.log('WiFi 5G:', {
  ssid: device.wifi_5g?.ssid,
  ativo: device.wifi_5g?.enabled ? 'Sim' : 'Não',
  visivel: device.wifi_5g?.visible ? 'Sim' : 'Não',
  canal: device.wifi_5g?.channel
});

// Alterar WiFi
const result = await api.configureWifi({
  login: 'cliente123',
  wifi_2g_ssid: 'NovaRede',
  wifi_2g_password: 'novaSenha123',
});
console.log('Alterações:', result.parameters_changed);
```

---

### Kotlin (Android Nativo)

```kotlin
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject

class SemppeBridgeApi(
    private val baseUrl: String,
    private val apiKey: String
) {
    private val client = OkHttpClient()
    private val jsonMediaType = "application/json; charset=utf-8".toMediaType()
    
    suspend fun searchDevice(login: String): JSONObject = withContext(Dispatchers.IO) {
        val request = Request.Builder()
            .url("$baseUrl/api/mobile/device/search?login=$login")
            .addHeader("X-API-Key", apiKey)
            .get()
            .build()
        
        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                throw Exception("Erro: ${response.code}")
            }
            JSONObject(response.body?.string() ?: "{}")
        }
    }
    
    suspend fun configureWifi(
        login: String,
        wifi2gSsid: String? = null,
        wifi2gPassword: String? = null,
        wifi5gSsid: String? = null,
        wifi5gPassword: String? = null
    ): JSONObject = withContext(Dispatchers.IO) {
        val json = JSONObject().apply {
            put("login", login)
            wifi2gSsid?.let { put("wifi_2g_ssid", it) }
            wifi2gPassword?.let { put("wifi_2g_password", it) }
            wifi5gSsid?.let { put("wifi_5g_ssid", it) }
            wifi5gPassword?.let { put("wifi_5g_password", it) }
        }
        
        val body = json.toString().toRequestBody(jsonMediaType)
        
        val request = Request.Builder()
            .url("$baseUrl/api/mobile/wifi/configure")
            .addHeader("X-API-Key", apiKey)
            .post(body)
            .build()
        
        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                throw Exception("Erro: ${response.code}")
            }
            JSONObject(response.body?.string() ?: "{}")
        }
    }
}

// Uso:
val api = SemppeBridgeApi(
    baseUrl = "http://138.117.248.205:8087",
    apiKey = "semppre-mobile-dev-token-2025"
)

// Em uma coroutine:
lifecycleScope.launch {
    try {
        val device = api.searchDevice("cliente123")
        Log.d("API", "Modelo: ${device.optString("model")}")
        
        val result = api.configureWifi(
            login = "cliente123",
            wifi2gSsid = "NovaRede",
            wifi2gPassword = "novaSenha123"
        )
        Log.d("API", "Sucesso: ${result.optBoolean("success")}")
    } catch (e: Exception) {
        Log.e("API", "Erro: ${e.message}")
    }
}
```

---

## ⚠️ Códigos de Erro

| Código | Descrição |
|--------|-----------|
| 200 | Sucesso |
| 400 | Requisição inválida (parâmetros faltando ou inválidos) |
| 401 | Token de API inválido ou não fornecido |
| 404 | Dispositivo não encontrado |
| 502 | Erro de comunicação com o servidor ACS |
| 500 | Erro interno do servidor |

---

## 🔒 Segurança

1. **Sempre use HTTPS em produção**
2. **Configure um token forte e único** no servidor
3. **Não exponha o token** no código do app (use configuração segura)
4. **Monitore logs** de tentativas de acesso inválido
5. **Considere rate limiting** para prevenir abusos

---

## 📞 Suporte

Em caso de dúvidas ou problemas, verifique os logs do servidor:

```bash
journalctl -u semppre-bridge -f | grep "Mobile API"
```
