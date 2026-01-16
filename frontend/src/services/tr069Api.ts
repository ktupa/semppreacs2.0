// src/services/tr069Api.ts
// API para comunicação com o backend TR-069 normalizado
import axios, { AxiosInstance } from "axios";

const apiTr069: AxiosInstance = axios.create({
  baseURL: "/api/tr069",
  withCredentials: false,
});

/**
 * Tipos
 */
export interface SetParamRequest {
  device_id: string;
  parameters: ParamInput[];
  use_connection_request?: boolean;
  retry_on_fail?: boolean;
  max_retries?: number;
}

export interface ParamInput {
  path: string;
  value: any;
  type?: string;
  vars?: Record<string, any>;
}

export interface SetParamResponse {
  success: boolean;
  device_id: string;
  data_model: string;
  parameters_sent: [string, string, string][];
  task_id?: string;
  message: string;
  errors?: string[];
}

export interface WifiConfig {
  ssid?: string;
  password?: string;
  channel?: number;
  enabled?: boolean;
  hidden?: boolean;
  radio?: number; // 1=2.4GHz, 2=5GHz
}

export interface LanConfig {
  ip?: string;
  subnet_mask?: string;
  dhcp_enabled?: boolean;
  dhcp_start?: string;
  dhcp_end?: string;
  dhcp_lease?: number;
}

export interface PPPoEConfig {
  username: string;
  password: string;
}

/**
 * SetParameterValues inteligente com normalização automática.
 * Funciona com qualquer dispositivo (TR-098 ou TR-181).
 */
export async function setParameterValuesAuto(request: SetParamRequest): Promise<SetParamResponse> {
  const response = await apiTr069.post<SetParamResponse>("/set-params", request);
  return response.data;
}

/**
 * Configurar WiFi de forma simplificada.
 * O backend normaliza automaticamente para o modelo do dispositivo.
 */
export async function setWifiConfig(deviceId: string, config: WifiConfig): Promise<SetParamResponse> {
  const response = await apiTr069.post<SetParamResponse>("/set-wifi", {
    device_id: deviceId,
    ...config,
    radio: config.radio || 1,
  });
  return response.data;
}

/**
 * Configurar PPPoE de forma simplificada.
 */
export async function setPPPoEConfig(deviceId: string, config: PPPoEConfig): Promise<SetParamResponse> {
  const response = await apiTr069.post<SetParamResponse>("/set-pppoe", {
    device_id: deviceId,
    ...config,
  });
  return response.data;
}

/**
 * Configurar LAN de forma simplificada.
 */
export async function setLanConfig(deviceId: string, config: LanConfig): Promise<SetParamResponse> {
  const response = await apiTr069.post<SetParamResponse>("/set-lan", {
    device_id: deviceId,
    ...config,
  });
  return response.data;
}

/**
 * Reiniciar dispositivo.
 */
export async function rebootDevice(deviceId: string): Promise<{ success: boolean; message: string }> {
  const response = await apiTr069.post("/reboot", { device_id: deviceId });
  return response.data;
}

/**
 * Factory reset.
 */
export async function factoryResetDevice(deviceId: string): Promise<{ success: boolean; message: string }> {
  const response = await apiTr069.post("/factory-reset", { device_id: deviceId });
  return response.data;
}

/**
 * Refresh (atualizar dados do dispositivo).
 */
export async function refreshDevice(deviceId: string, objectName: string = ""): Promise<{ success: boolean; message: string }> {
  const response = await apiTr069.post("/refresh", { device_id: deviceId, object_name: objectName });
  return response.data;
}

/**
 * Obter caminhos normalizados para um dispositivo.
 */
export async function getNormalizedPaths(
  logicalPath: string,
  _manufacturer?: string,
  _productClass?: string
): Promise<{ tr098: string; tr181: string }> {
  const response = await apiTr069.post("/get-paths", {
    logical_path: logicalPath,
  });
  return response.data.paths;
}

/**
 * Obter parâmetros WiFi normalizados.
 */
export async function getWifiParams(manufacturer: string, productClass?: string, radio: number = 1) {
  const response = await apiTr069.post("/wifi-params", {
    manufacturer,
    product_class: productClass,
    data: null,
  }, {
    params: { radio }
  });
  return response.data;
}

/**
 * Obter parâmetros LAN normalizados.
 */
export async function getLanParams(manufacturer: string, productClass?: string) {
  const response = await apiTr069.post("/lan-params", {
    manufacturer,
    product_class: productClass,
    data: null,
  });
  return response.data;
}

/**
 * Obter parâmetros WAN normalizados.
 */
export async function getWanParams(manufacturer: string, productClass?: string) {
  const response = await apiTr069.post("/wan-params", {
    manufacturer,
    product_class: productClass,
    data: null,
  });
  return response.data;
}

/**
 * Listar todos os caminhos lógicos disponíveis.
 */
export async function listAvailablePaths(category?: string) {
  const response = await apiTr069.get("/available-paths", {
    params: category ? { category } : undefined,
  });
  return response.data;
}

/**
 * Listar categorias de parâmetros.
 */
export async function listCategories() {
  const response = await apiTr069.get("/categories");
  return response.data;
}

/**
 * Listar fabricantes suportados.
 */
export async function listManufacturers() {
  const response = await apiTr069.get("/manufacturers");
  return response.data;
}

// Export default com todas as funções
export default {
  setParameterValuesAuto,
  setWifiConfig,
  setPPPoEConfig,
  setLanConfig,
  rebootDevice,
  factoryResetDevice,
  refreshDevice,
  getNormalizedPaths,
  getWifiParams,
  getLanParams,
  getWanParams,
  listAvailablePaths,
  listCategories,
  listManufacturers,
};
