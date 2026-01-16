// src/services/genieAcsApi.ts
import axios, { AxiosError, AxiosInstance, AxiosRequestConfig } from "axios";

/**
 * =========================
 *  AXIOS INSTANCES
 * =========================
 *  /api-genie → GenieACS NBI (via proxy do Vite)
 *  /diagnostico → FastAPI de diagnóstico (via proxy do Vite)
 */
const apiGenie: AxiosInstance = axios.create({
  baseURL: "/api-genie",
  withCredentials: true,
});

const apiDiag: AxiosInstance = axios.create({
  baseURL: "/diagnostico",
  withCredentials: false,
});

const apiAnalytics: AxiosInstance = axios.create({
  baseURL: "/analytics",
  withCredentials: false,
});

/**
 * =========================
 *  TYPES
 * =========================
 */
export type XsdType =
  | "xsd:string"
  | "xsd:boolean"
  | "xsd:int"
  | "xsd:unsignedInt"
  | "xsd:dateTime"
  | string;

export type ParamValueObj = { name: string; value: string; type: XsdType };
export type ParamValueTuple = [name: string, value: string, type: XsdType];
export type ParamValue = ParamValueObj | ParamValueTuple;

export type GenieTask =
  | { name: "reboot" }
  | { name: "factoryReset" }
  | { name: "refreshObject"; objectName?: string }
  | { name: "download"; file: string; fileType?: string; fileSize?: number; targetFileName?: string }
  | { name: "setParameterValues"; parameterValues: ParamValueTuple[] }
  | { name: "getParameterValues"; parameterNames: string[] };

export interface DeviceId {
  _SerialNumber: string;
  _Manufacturer: string;
  _ProductClass: string;
}

export interface DeviceMinimal {
  _id: string;
  _lastInform?: string;
  _tags?: string[];
  _deviceId: DeviceId;
  InternetGatewayDevice?: Record<string, any>;
}

export interface FileEntry {
  _id?: string;
  name: string;
  filename?: string;
  length?: number;
  lastModified?: string;
  _timestamp?: string;
  fileType?: string;
  version?: string;
  oui?: string;
  created?: string;
}

export interface DiagPingOut {
  stdout: string;
}

export interface DiagTracerouteOut {
  stdout?: string;
  hops?: Array<{ hop: number; host?: string; ip?: string; rtts?: number[] }>;
  [k: string]: any;
}

export interface DiagSpeedtestOut {
  download_mbps?: number;
  upload_mbps?: number;
  ping_ms?: number;
  jitter_ms?: number;
  raw?: any;
}

/**
 * =========================
 *  HELPERS
 * =========================
 */
function toParamTuples(params: ParamValue[]): ParamValueTuple[] {
  return params.map((p) => (Array.isArray(p) ? p : [p.name, p.value, p.type]));
}

function ensureOk(status: number): void {
  if (status < 200 || status >= 300) throw new Error(`HTTP ${status}`);
}

function parseAxiosError(err: unknown): string {
  const e = err as AxiosError<any>;
  if (e.response) {
    const data =
      typeof e.response.data === "string" ? e.response.data : JSON.stringify(e.response.data);
    return `HTTP ${e.response.status} – ${data}`;
  }
  if (e.request) return "Sem resposta do servidor";
  return e.message || String(err);
}

/** Segurança básica para connection request */
function buildTasksUrl(deviceId: string, connectionRequest = false): string {
  const safeId = encodeURIComponent(deviceId);
  return `/devices/${safeId}/tasks${connectionRequest ? "?connection_request" : ""}`;
}

/**
 * =========================
 *  AUTH (UI Genie)
 * =========================
 */
export async function logIn(username: string, password: string): Promise<void> {
  const { data } = await axios.post("/genie-ui/login", { username, password });
  const token = String(data).replace(/"/g, "");
  localStorage.setItem("token", token);
}

export async function logOut(): Promise<void> {
  await axios.post("/genie-ui/logout");
  localStorage.removeItem("token");
}

/**
 * =========================
 *  HEALTH
 * =========================
 */
export async function checkConnection() {
  return await apiGenie.get("/status");
}

/**
 * =========================
 *  RECURSOS GENÉRICOS
 * =========================
 */
export async function fetchResource<T = any>(
  resourceType: string,
  filterExpr: any,
  options: { limit?: number; sort?: Record<string, number> } = {}
): Promise<T[]> {
  const filterStr = JSON.stringify(filterExpr);
  const params: Record<string, string> = { filter: filterStr };
  if (options.limit) params["limit"] = String(options.limit);
  if (options.sort) params["sort"] = JSON.stringify(options.sort);
  const qs = new URLSearchParams(params).toString();
  const { data } = await apiGenie.get<T[]>(`/api/${resourceType}/?${qs}`);
  return data;
}

/**
 * =========================
 *  DEVICES
 * =========================
 */
export async function fetchDevices(): Promise<DeviceMinimal[]> {
  // compat com código antigo
  const response = await axios.get<DeviceMinimal[]>(`/api-genie/devices?query=%7B%7D`);
  return response.data;
}

export async function getDevices(
  query?: object,
  projection?: string
): Promise<DeviceMinimal[]> {
  const params: any = {};
  if (query) params.query = JSON.stringify(query);
  if (projection) params.projection = projection;
  const res = await apiGenie.get<DeviceMinimal[]>("/devices", { params });
  return res.data;
}

/**
 * Busca dispositivos com projection otimizada para listagem rápida.
 * Retorna apenas campos essenciais, reduzindo payload em ~90%.
 */
export async function getDevicesMinimal(
  query?: object
): Promise<DeviceMinimal[]> {
  // Projection mínima para tabela de dispositivos - TR-098 e TR-181
  const projection = [
    "_id",
    "_lastInform",
    "_tags",
    "_deviceId._SerialNumber",
    "_deviceId._Manufacturer",
    "_deviceId._ProductClass",
    // TR-098 (InternetGatewayDevice)
    "InternetGatewayDevice.DeviceInfo.SoftwareVersion._value",
    "InternetGatewayDevice.DeviceInfo.FirmwareVersion._value",
    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Username._value",
    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.ExternalIPAddress._value",
    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.2.Username._value",
    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.2.ExternalIPAddress._value",
    "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.ExternalIPAddress._value",
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID._value",
    "InternetGatewayDevice.LANDevice.1.WLANConfiguration.2.SSID._value",
    "InternetGatewayDevice.LANDevice.1.LANEthernetInterfaceConfig.1.Status._value",
    // TR-181 (Device) - Zyxel, TP-Link EC220-G5 v3
    "Device.DeviceInfo.SoftwareVersion._value",
    "Device.DeviceInfo.FirmwareVersion._value",
    "Device.PPP.Interface.1.Username._value",
    "Device.PPP.Interface.1.IPCP.LocalIPAddress._value",
    "Device.PPP.Interface.2.Username._value",
    "Device.PPP.Interface.2.IPCP.LocalIPAddress._value",
    "Device.IP.Interface.1.IPv4Address.1.IPAddress._value",
    "Device.IP.Interface.3.IPv4Address.1.IPAddress._value",
    "Device.WiFi.SSID.1.SSID._value",
    "Device.WiFi.SSID.2.SSID._value",
    "Device.Ethernet.Interface.1.Status._value"
  ].join(",");
  
  const params: any = { projection };
  if (query) params.query = JSON.stringify(query);
  const res = await apiGenie.get<DeviceMinimal[]>("/devices", { params });
  return res.data;
}

export async function getDeviceById(id: string): Promise<DeviceMinimal[]> {
  // O ID vem da URL e pode estar em vários formatos devido ao encoding
  // Ex: 909F22-PX3321-T1-S240Y29099655 (sem encoding)
  // Ex: 909F22-PX3321%252DT1-S240Y29099655 (double encoded)
  const originalId = id;
  const decodedOnce = decodeURIComponent(id);
  const decodedTwice = decodeURIComponent(decodedOnce);
  
  console.log("[getDeviceById] ID original:", originalId);
  console.log("[getDeviceById] ID decoded 1x:", decodedOnce);
  console.log("[getDeviceById] ID decoded 2x:", decodedTwice);
  
  try {
    // Estratégia 1: Buscar todos dispositivos e filtrar client-side
    // É mais confiável para IDs com caracteres especiais
    console.log("[getDeviceById] Buscando todos dispositivos...");
    const res = await apiGenie.get<DeviceMinimal[]>("/devices");
    
    if (res.data && res.data.length > 0) {
      // Tentar match com qualquer variação do ID
      const found = res.data.filter(d => {
        const deviceId = d._id;
        // Comparar com todas as variações possíveis
        return deviceId === originalId || 
               deviceId === decodedOnce || 
               deviceId === decodedTwice ||
               // Comparar sem encoding (remover todos os %)
               deviceId.replace(/%/g, '') === originalId.replace(/%/g, '') ||
               // Comparar serial number (última parte após último -)
               deviceId.split('-').pop() === originalId.split('-').pop();
      });
      
      console.log("[getDeviceById] Encontrado:", found.length, "dispositivo(s)");
      
      if (found.length > 0) {
        return found;
      }
    }
    
    // Estratégia 2: Query específica como fallback
    console.log("[getDeviceById] Tentando query direta...");
    const query = { _id: decodedOnce };
    const queryRes = await apiGenie.get<DeviceMinimal[]>("/devices", { 
      params: { query: JSON.stringify(query) }
    });
    
    if (queryRes.data.length > 0) {
      console.log("[getDeviceById] Query direta encontrou:", queryRes.data.length);
      return queryRes.data;
    }
    
    console.warn("[getDeviceById] Nenhum dispositivo encontrado para ID:", originalId);
    return [];
    
  } catch (err) {
    console.error("[getDeviceById] Erro:", err);
    throw err;
  }
}

export async function deleteDevice(id: string): Promise<void> {
  const res = await apiGenie.delete(`/devices/${encodeURIComponent(id)}`);
  ensureOk(res.status);
}

/**
 * =========================
 *  TASKS
 * =========================
 */
export async function getTasks<T = any>(query?: object): Promise<T[]> {
  const params: any = {};
  if (query) params.query = JSON.stringify(query);
  const res = await apiGenie.get<T[]>("/tasks", { params });
  return res.data;
}

export async function createTask(
  deviceId: string,
  task: GenieTask,
  connectionRequest = false
): Promise<any> {
  const url = buildTasksUrl(deviceId, connectionRequest);
  try {
    const res = await apiGenie.post(url, task, {
      headers: { "Content-Type": "application/json" },
    });
    ensureOk(res.status);
    return res.data;
  } catch (err) {
    const msg = parseAxiosError(err);
    console.error("createTask ERROR:", { deviceId, url, task, msg });
    throw new Error(`createTask falhou: ${msg}`);
  }
}

export async function retryTask(taskId: string): Promise<void> {
  const res = await apiGenie.post(`/tasks/${encodeURIComponent(taskId)}/retry`);
  ensureOk(res.status);
}
export async function deleteTask(taskId: string): Promise<void> {
  const res = await apiGenie.delete(`/tasks/${encodeURIComponent(taskId)}`);
  ensureOk(res.status);
}

/**
 * =========================
 *  TAGS
 * =========================
 */
export async function addTag(deviceId: string, tag: string): Promise<void> {
  const res = await apiGenie.post(
    `/devices/${encodeURIComponent(deviceId)}/tags/${encodeURIComponent(tag)}`
  );
  ensureOk(res.status);
}
export async function deleteTag(deviceId: string, tag: string): Promise<void> {
  const res = await apiGenie.delete(
    `/devices/${encodeURIComponent(deviceId)}/tags/${encodeURIComponent(tag)}`
  );
  ensureOk(res.status);
}

/**
 * =========================
 *  PRESETS / PROVISIONS / FILES
 * =========================
 */
export async function createOrUpdatePreset(name: string, preset: any): Promise<void> {
  const res = await apiGenie.put(`/presets/${encodeURIComponent(name)}`, preset);
  ensureOk(res.status);
}
export async function deletePreset(name: string): Promise<void> {
  const res = await apiGenie.delete(`/presets/${encodeURIComponent(name)}`);
  ensureOk(res.status);
}
export async function getPresets<T = any>(): Promise<T[]> {
  const res = await apiGenie.get<T[]>("/presets");
  return res.data;
}

export async function createProvision(name: string, script: string): Promise<void> {
  const res = await apiGenie.put(`/provisions/${encodeURIComponent(name)}`, script, {
    headers: { "Content-Type": "text/plain" },
  });
  ensureOk(res.status);
}
export async function deleteProvision(name: string): Promise<void> {
  const res = await apiGenie.delete(`/provisions/${encodeURIComponent(name)}`);
  ensureOk(res.status);
}
export async function getProvisions<T = any>(): Promise<T[]> {
  const res = await apiGenie.get<T[]>("/provisions");
  return res.data;
}

export async function uploadFile(
  name: string,
  file: Blob,
  headers: Record<string, string>
): Promise<void> {
  const res = await apiGenie.put(`/files/${encodeURIComponent(name)}`, file, { headers });
  ensureOk(res.status);
}
export async function deleteFile(name: string): Promise<void> {
  const res = await apiGenie.delete(`/files/${encodeURIComponent(name)}`);
  ensureOk(res.status);
}
export async function getFiles(query?: object): Promise<FileEntry[]> {
  const params: any = {};
  if (query) params.query = JSON.stringify(query);
  const res = await apiGenie.get<FileEntry[]>("/files", { params });
  return res.data;
}

/**
 * =========================
 *  COUNT
 * =========================
 */
export async function countDocuments(collection: string, query: object): Promise<number> {
  const params = { query: JSON.stringify(query) };
  const res = await apiGenie.head(`/${collection}`, { params });
  const headersAny = res.headers as Record<string, string>;
  const total = headersAny["x-total-count"] ?? "0";
  return parseInt(total, 10);
}

/**
 * =========================
 *  AÇÕES RÁPIDAS
 * =========================
 */
export async function rebootCPE(deviceId: string) {
  return await createTask(deviceId, { name: "reboot" }, true);
}
export async function factoryResetCPE(deviceId: string) {
  return await createTask(deviceId, { name: "factoryReset" }, true);
}
export async function refreshCPE(deviceId: string) {
  return await createTask(deviceId, { name: "refreshObject", objectName: "" }, true);
}
export async function pushFileToCPE(deviceId: string, fileUrl: string, targetFileName?: string) {
  const task: GenieTask = { name: "download", file: fileUrl, targetFileName };
  return await createTask(deviceId, task, true);
}

/**
 * =========================
 *  setParameterValues – aceita objetos ou tuplas
 * =========================
 */
export async function setParameterValues(deviceId: string, params: ParamValue[]) {
  if (!params?.length) throw new Error("Nenhum parâmetro para aplicar");
  const tuples = toParamTuples(params);
  const payload: GenieTask = { name: "setParameterValues", parameterValues: tuples };

  try {
    const res = await apiGenie.post(buildTasksUrl(deviceId, true), payload, {
      headers: { "Content-Type": "application/json" },
    });
    ensureOk(res.status);
    return res.data;
  } catch (err) {
    const msg = parseAxiosError(err);
    console.error("setParameterValues ERROR:", { deviceId, payload, msg });
    throw new Error(`setParameterValues falhou: ${msg}`);
  }
}

/**
 * =========================
 *  FUNÇÕES ESPECÍFICAS DO SEU FLUXO
 * =========================
 */
export async function enviarDownloadDiagnostics(deviceId: string) {
  const payload: GenieTask = {
    name: "download",
    file: "http://138.117.249.70/teste.bin",
    targetFileName: "diagnostico-teste.bin",
  };
  try {
    const res = await apiGenie.post(buildTasksUrl(deviceId, true), payload);
    ensureOk(res.status);
    return res.data;
  } catch (err) {
    const msg = parseAxiosError(err);
    console.error("enviarDownloadDiagnostics ERROR:", { deviceId, payload, msg });
    throw new Error(`downloadDiagnostics falhou: ${msg}`);
  }
}

export async function derrubarHost(mac: string, deviceId: string) {
  if (!deviceId) throw new Error("deviceId é obrigatório");
  const parameterPath = `InternetGatewayDevice.LANDevice.1.Hosts.Host.${mac}.LeaseTimeRemaining`;
  const task: GenieTask = {
    name: "setParameterValues",
    parameterValues: [[parameterPath, "0", "xsd:unsignedInt"]],
  };
  const res = await apiGenie.post(buildTasksUrl(deviceId, true), task);
  ensureOk(res.status);
  return res.data;
}

export function gerarParametrosLanConfig(
  ip: string,
  mask: string,
  dhcp: boolean,
  lease: string,
  ipInicial: string,
  ipFinal: string,
  dns: string,
  gateway: string
): ParamValue[] {
  return [
    { name: "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.DHCPServerEnable", value: String(dhcp), type: "xsd:boolean" },
    { name: "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.DHCPLeaseTime", value: lease, type: "xsd:unsignedInt" },
    { name: "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.MinAddress", value: ipInicial, type: "xsd:string" },
    { name: "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.MaxAddress", value: ipFinal, type: "xsd:string" },
    { name: "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.DNSServers", value: dns, type: "xsd:string" },
    { name: "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.IPRouters", value: gateway, type: "xsd:string" },
    { name: "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.IPInterface.1.IPInterfaceIPAddress", value: ip, type: "xsd:string" },
    { name: "InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.IPInterface.1.IPInterfaceSubnetMask", value: mask, type: "xsd:string" },
  ];
}

export const apiBackend = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || "", // URL relativa usa proxy do Vite
  withCredentials: false,
});

// API para feeds (métricas, alertas, tarefas)
const apiFeeds: AxiosInstance = axios.create({
  baseURL: "/feeds",
  withCredentials: false,
});

export type IxcClienteOut = {
  found: boolean;
  login: string;
  id_cliente?: string;
  cliente?: {
    id?: string;
    nome?: string;
    cpf_cnpj?: string;
    telefone?: string;
    celular?: string;
    email?: string;
    cidade?: string;
    bairro?: string;
    endereco?: string;
  };
  contratos?: Array<{ id?: string; status?: string; descricao?: string; plano?: string; login?: string }>;
  cobrancas_aberto?: Array<{ id?: string; vencimento?: string; valor?: string | number; nosso_numero?: string; status?: string }>;
  message?: string;
};

// === IXC: Tipos “full” ===
export interface IxcClienteBasic {
  id?: string;
  nome?: string;
  cpf_cnpj?: string;
  email?: string;
  telefone?: string;
  celular?: string;
  cidade?: string;
  bairro?: string;
  endereco?: string;
  uf?: string;
  status?: string;
  codigo?: string;
}

export interface IxcClienteFullOut {
  // Base (radusuarios)
  found: boolean;
  login: string;
  id?: string;                 // id do radusuario
  id_cliente?: string;         // cliente (id)
  id_contrato?: string;
  status?: string;             // S/N do radusuarios
  plano?: string | null;
  raw?: any;                   // radusuarios cru (com ip, mac, pd_ipv6 etc.)

  // Dados cliente
  cliente_found?: boolean;
  cliente_id?: string;
  cliente_basic?: IxcClienteBasic;
  cliente_raw?: any;

  // Opcional: listas agregadas
  contratos?: Array<{ id?: string; status?: string; descricao?: string; plano?: string; login?: string }>;
  cobrancas_aberto?: Array<{ id?: string; vencimento?: string; valor?: string | number; nosso_numero?: string; status?: string }>;

  // Mensagens
  message?: string;
}

/* =========================
 *  IXC: helpers e rotas (ajustadas)
 * ========================= */

// Helper: tenta via proxy (/ixc/...) e fallback para VITE_API_BASE absoluto
async function getBackend<T = any>(path: string): Promise<T> {
  try {
    const r = await apiBackend.get<T>(path);
    return r.data;
  } catch (e1) {
    const base = (import.meta.env.VITE_API_BASE || "").replace(/\/+$/, "");
    if (!base) throw e1;
    const r2 = await axios.get<T>(`${base}${path}`);
    return r2.data;
  }
}

// básico
export async function getIxcByLogin(login: string): Promise<IxcClienteOut> {
  try {
    return await getBackend<IxcClienteOut>(`/ixc/cliente/by-login/${encodeURIComponent(login)}`);
  } catch (err: any) {
    return { found: false, login, message: err?.response?.data?.detail || "Falha na integração IXC" };
  }
}

// completo
export async function getIxcClienteFullByLogin(login: string): Promise<IxcClienteFullOut> {
  try {
    return await getBackend<IxcClienteFullOut>(`/ixc/cliente/dados/by-login/${encodeURIComponent(login)}`);
  } catch (err: any) {
    return {
      found: false,
      login,
      message: err?.response?.data?.detail || "Falha na integração IXC (full)",
    };
  }
}

function isValidHost(h?: string) {
  if (!h) return false;
  const s = h.trim();
  if (!s || s === "—") return false;
  // aceita IPv4/IPv6/hostname simples
  return /^[A-Za-z0-9\.\-:\[\]]+$/.test(s);
}

export async function pingCustom(host: string): Promise<DiagPingOut> {
  const target = host?.trim();
  if (!isValidHost(target)) {
    const err = new Error('host vazio/indefinido');
    console.warn("pingCustom SKIP:", { host });
    throw err;
  }

  try {
    // 1) /diagnostico/ping?host=...
    const r = await apiDiag.get<{ stdout?: string }>(`/ping`, { params: { host: target } });
    return { stdout: r.data.stdout ?? JSON.stringify(r.data) };
  } catch (err) {
    try {
      // 2) /diagnostico/ping/:host (fallback)
      const r2 = await apiDiag.get<{ stdout?: string }>(`/ping/${encodeURIComponent(target)}`);
      return { stdout: r2.data.stdout ?? JSON.stringify(r2.data) };
    } catch (e2) {
      const msg = parseAxiosError(err);
      const msg2 = parseAxiosError(e2);
      console.error("pingCustom ERROR:", { msg, msg2 });
      throw new Error(`HTTP 400 – {"detail":"host inválido"}`);
    }
  }
}

export async function traceroute(host: string): Promise<DiagTracerouteOut> {
  try {
    const r = await apiDiag.get<DiagTracerouteOut>(`/traceroute`, { params: { host } });
    return r.data;
  } catch {
    const r2 = await apiDiag.get<DiagTracerouteOut>(`/traceroute/${encodeURIComponent(host)}`);
    return r2.data;
  }
}

export async function speedTest(ip?: string): Promise<DiagSpeedtestOut> {
  const r = await apiDiag.get<DiagSpeedtestOut>(`/speedtest`, { params: ip ? { ip } : {} });
  return r.data;
}

/** Helpers genéricos para novas rotas do FastAPI */
async function diagGet<T = any>(path: string, params?: Record<string, any>, cfg?: AxiosRequestConfig) {
  const r = await apiDiag.get<T>(path, { ...(cfg || {}), params });
  return r.data;
}
async function diagPost<T = any>(path: string, body?: any, cfg?: AxiosRequestConfig) {
  const r = await apiDiag.post<T>(path, body, cfg);
  return r.data;
}

export function humanizeSeconds(total?: string | number): string {
  const n = Number(total ?? 0);
  if (!isFinite(n) || n <= 0) return "—";
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const s = Math.floor(n % 60);
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/** ROTAS NOVAS (já prontas para você plugar no main.py) */
export async function whois(host: string) {
  return await diagGet<{ raw: string }>("/whois", { host });
}
export async function dnsResolve(name: string, type: "A" | "AAAA" | "CNAME" | "MX" | "TXT" | "NS" = "A") {
  return await diagGet<{ answers: string[] }>("/dns/resolve", { name, type });
}
export async function arpScan(iface?: string, timeout?: number) {
  return await diagGet<{ hosts: Array<{ ip: string; mac: string }> }>("/arp/scan", { iface, timeout });
}
export async function wanBandwidth(iface?: string) {
  return await diagGet<{ rx_mbps: number; tx_mbps: number; ts: string }>("/wan/bandwidth", { iface });
}
export async function iperfClient(target: string, seconds = 10) {
  return await diagPost<{ mbps: number }>("/iperf/client", { target, seconds });
}

// =========================
//  FEEDS: TAREFAS & ERROS RECENTES
// =========================

/** Converte qualquer valor para string segura para exibição */
function safeStr(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "object") {
    // Se for um objeto Error-like
    if ("message" in (value as object)) {
      return String((value as { message: unknown }).message);
    }
    // Se for um objeto com faultString (erro do GenieACS)
    if ("faultString" in (value as object)) {
      return String((value as { faultString: unknown }).faultString);
    }
    // Fallback: JSON stringify
    try {
      return JSON.stringify(value);
    } catch {
      return "[object]";
    }
  }
  return String(value);
}

/** Normaliza datas variadas do NBI para string legível */
function normTime(x: any): string {
  const v =
    x?.time ?? x?._time ?? x?.timestamp ?? x?._timestamp ??
    x?.completed ?? x?.enqueued ?? x?.ts ?? x?.date;
  try {
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d.toLocaleString();
  } catch {}
  return String(v ?? "");
}

export interface RecentTaskItem {
  time: string;
  deviceId?: string;
  name?: string;
  status?: string;
  detail?: string;
}

/**
 * Busca últimas tarefas no GenieACS.
 * Usa sort por timestamp desc + limit. Normaliza para {time, deviceId, name, status}.
 */
export async function getTasksRecent(limit = 50): Promise<RecentTaskItem[]> {
  const params: any = {
    sort: JSON.stringify({ _timestamp: -1 }),
    limit: String(limit),
  };
  const { data } = await apiGenie.get<any[]>("/tasks", { params });

  return (data || []).map((t) => ({
    time: normTime(t),
    deviceId: safeStr(t.device ?? t.deviceId ?? t._device ?? t._deviceId ?? t?.channel),
    name: safeStr(t.name ?? t._name ?? t.type),
    status: safeStr(
      t.status ??
      (t.completed ? "ok" : undefined) ??
      (t.error || t.fault ? "fail" : undefined) ??
      t?.state
    ) ?? "unknown",
    detail: safeStr(t.error ?? t.reason ?? t.fault ?? t.result),
  }));
}

/**
 * Busca erros/falhas recentes.
 * 1) Tenta /faults (se disponível),
 * 2) fallback para /logs filtrando severidade "error".
 */
export async function getErrorsRecent(limit = 50): Promise<RecentTaskItem[]> {
  // Tentativa 1: /faults
  try {
    const params: any = {
      sort: JSON.stringify({ _timestamp: -1 }),
      limit: String(limit),
    };
    const { data } = await apiGenie.get<any[]>("/faults", { params });
    if (Array.isArray(data)) {
      return data.map((f) => ({
        time: normTime(f),
        deviceId: safeStr(f.device ?? f.deviceId ?? f._device ?? f._deviceId),
        name: safeStr(f.name ?? f.component) ?? "fault",
        status: "error",
        detail: safeStr(f.detail ?? f.message ?? f.reason ?? f.description),
      }));
    }
  } catch {
    // segue para /logs
  }

  // Tentativa 2: /logs?query={"severity":"error"}
  try {
    const params: any = {
      query: JSON.stringify({ severity: "error" }),
      sort: JSON.stringify({ _timestamp: -1 }),
      limit: String(limit),
    };
    const { data } = await apiGenie.get<any[]>("/logs", { params });
    return (data || []).map((l) => ({
      time: normTime(l),
      deviceId: safeStr(l.device ?? l.deviceId ?? l._device ?? l._deviceId),
      name: safeStr(l.event ?? l.name) ?? "error",
      status: "error",
      detail: safeStr(l.message ?? l.detail ?? l.reason ?? l.description),
    }));
  } catch {
    // Sem /faults e /logs — retorna vazio
    return [];
  }
}

// =========================
//  ANALYTICS & IA
// =========================

export interface AnalyticsSummary {
  device_id?: string;
  timestamp: string;
  insights: string[];
  recommendations: string[];
  metrics: {
    latency_health: string;
    dropout_risk: string;
    wifi_quality: string;
  };
}

export interface DashboardOverview {
  timestamp: string;
  health_summary: {
    excellent: number;
    good: number;
    fair: number;
    poor: number;
    critical: number;
  };
  top_issues: Array<{
    type: string;
    count: number;
    severity: string;
    description: string;
  }>;
  trends: {
    latency: string;
    dropouts: string;
    wifi_quality: string;
  };
  ai_insights: string[];
}

export async function getAnalyticsSummary(deviceId?: string): Promise<AnalyticsSummary | null> {
  try {
    const params = deviceId ? { device_id: deviceId } : {};
    const { data } = await apiAnalytics.get<{ success: boolean; summary: AnalyticsSummary }>("/summary", { params });
    return data.success ? data.summary : null;
  } catch (err) {
    console.error("getAnalyticsSummary error:", err);
    return null;
  }
}

export async function getDashboardOverview(): Promise<DashboardOverview | null> {
  try {
    const { data } = await apiAnalytics.get<{ success: boolean; overview: DashboardOverview }>("/dashboard/overview");
    return data.success ? data.overview : null;
  } catch (err) {
    console.error("getDashboardOverview error:", err);
    return null;
  }
}

export interface LatencySample {
  timestamp: string;
  latency_ms: number;
}

export interface LatencyPrediction {
  device_id: string;
  predicted_latency_ms: number;
  confidence: number;
  trend: string;
  risk_level: string;
  predicted_for: string;
  analysis_window_hours: number;
  sample_count: number;
  statistics: {
    current_avg: number;
    current_std: number;
    current_min: number;
    current_max: number;
  };
  insights: string[];
}

export async function predictLatency(
  deviceId: string,
  samples: LatencySample[],
  predictionHorizonMinutes = 60
): Promise<LatencyPrediction | null> {
  try {
    const { data } = await apiAnalytics.post<{ success: boolean; prediction: LatencyPrediction }>(
      "/latency/predict",
      {
        device_id: deviceId,
        samples,
        prediction_horizon_minutes: predictionHorizonMinutes,
      }
    );
    return data.success ? data.prediction : null;
  } catch (err) {
    console.error("predictLatency error:", err);
    return null;
  }
}

export interface WifiMetricsInput {
  ssid_24ghz?: string;
  ssid_5ghz?: string;
  channel_24ghz?: number;
  channel_5ghz?: number;
  bandwidth_24ghz?: string;
  bandwidth_5ghz?: string;
  security_mode?: string;
  clients_24ghz?: number;
  clients_5ghz?: number;
  noise_24ghz?: number;
  noise_5ghz?: number;
  client_rssi_values?: number[];
  client_tx_rates?: number[];
}

export interface WifiQualityReport {
  device_id: string;
  overall_score: number;
  status: string;
  scores: Record<string, number>;
  issues: Array<{
    severity: string;
    category: string;
    message: string;
  }>;
  recommendations: string[];
  band_analysis: Record<string, any>;
  analyzed_at: string;
}

export async function analyzeWifiQuality(
  deviceId: string,
  metrics: WifiMetricsInput
): Promise<WifiQualityReport | null> {
  try {
    const { data } = await apiAnalytics.post<{ success: boolean; report: WifiQualityReport }>(
      "/wifi/analyze",
      {
        device_id: deviceId,
        metrics,
      }
    );
    return data.success ? data.report : null;
  } catch (err) {
    console.error("analyzeWifiQuality error:", err);
    return null;
  }
}

// =========================
//  FEEDS API - Alertas, Tarefas e Métricas do Backend
// =========================

export interface FeedAlert {
  id: number;
  device_id?: string;
  severity: string;
  category: string;
  title: string;
  message?: string;
  status: string;
  created_at?: string;
  acknowledged_at?: string;
  resolved_at?: string;
  details?: Record<string, any>;
}

export interface FeedTask {
  id: number;
  genie_task_id?: string;
  device_id?: string;
  task_type: string;
  status: string;
  fault_code?: string;
  fault_message?: string;
  triggered_by?: string;
  created_at?: string;
  started_at?: string;
  completed_at?: string;
  parameters?: Record<string, any>;
}

export interface FeedMetric {
  id: number;
  device_id?: string;
  collected_at?: string;
  bytes_received?: number;
  bytes_sent?: number;
  packets_received?: number;
  packets_sent?: number;
  errors_received?: number;
  errors_sent?: number;
  ping_latency_ms?: number;
  ping_jitter_ms?: number;
  ping_packet_loss?: number;
  wifi_clients_24ghz?: number;
  wifi_clients_5ghz?: number;
  channel_24ghz?: number;
  channel_5ghz?: number;
  noise_24ghz?: number;
  noise_5ghz?: number;
  cpu_usage?: number;
  memory_usage?: number;
  uptime_seconds?: number;
  lan_clients?: number;
  extra_metrics?: Record<string, any>;
}

export interface FeedsSummary {
  period_hours: number;
  alerts: {
    total: number;
    critical: number;
    error: number;
    warning: number;
    active: number;
  };
  tasks: {
    total: number;
    pending: number;
    success: number;
    failed: number;
  };
  metrics: {
    total: number;
    devices_active: number;
  };
}

/**
 * Busca alertas recentes do backend (AlertEvent).
 */
export async function getFeedsAlerts(options: {
  limit?: number;
  offset?: number;
  severity?: string;
  category?: string;
  status?: string;
  device_id?: string;
  hours?: number;
} = {}): Promise<{ total: number; alerts: FeedAlert[] }> {
  try {
    const params: Record<string, any> = {};
    if (options.limit) params.limit = options.limit;
    if (options.offset) params.offset = options.offset;
    if (options.severity) params.severity = options.severity;
    if (options.category) params.category = options.category;
    if (options.status) params.status = options.status;
    if (options.device_id) params.device_id = options.device_id;
    if (options.hours) params.hours = options.hours;

    const { data } = await apiFeeds.get<{ success: boolean; total: number; alerts: FeedAlert[] }>("/alerts", { params });
    return { total: data.total || 0, alerts: data.alerts || [] };
  } catch (err) {
    console.error("getFeedsAlerts error:", err);
    return { total: 0, alerts: [] };
  }
}

/**
 * Busca tarefas recentes do backend (TaskHistory).
 */
export async function getFeedsTasks(options: {
  limit?: number;
  offset?: number;
  status?: string;
  task_type?: string;
  device_id?: string;
  hours?: number;
} = {}): Promise<{ total: number; tasks: FeedTask[] }> {
  try {
    const params: Record<string, any> = {};
    if (options.limit) params.limit = options.limit;
    if (options.offset) params.offset = options.offset;
    if (options.status) params.status = options.status;
    if (options.task_type) params.task_type = options.task_type;
    if (options.device_id) params.device_id = options.device_id;
    if (options.hours) params.hours = options.hours;

    const { data } = await apiFeeds.get<{ success: boolean; total: number; tasks: FeedTask[] }>("/tasks", { params });
    return { total: data.total || 0, tasks: data.tasks || [] };
  } catch (err) {
    console.error("getFeedsTasks error:", err);
    return { total: 0, tasks: [] };
  }
}

/**
 * Busca métricas recentes do backend (DeviceMetric).
 */
export async function getFeedsMetrics(options: {
  limit?: number;
  offset?: number;
  device_id?: string;
  hours?: number;
} = {}): Promise<{ total: number; metrics: FeedMetric[] }> {
  try {
    const params: Record<string, any> = {};
    if (options.limit) params.limit = options.limit;
    if (options.offset) params.offset = options.offset;
    if (options.device_id) params.device_id = options.device_id;
    if (options.hours) params.hours = options.hours;

    const { data } = await apiFeeds.get<{ success: boolean; total: number; metrics: FeedMetric[] }>("/metrics", { params });
    return { total: data.total || 0, metrics: data.metrics || [] };
  } catch (err) {
    console.error("getFeedsMetrics error:", err);
    return { total: 0, metrics: [] };
  }
}

/**
 * Busca resumo geral de feeds (contagens).
 */
export async function getFeedsSummary(hours = 24): Promise<FeedsSummary | null> {
  try {
    const { data } = await apiFeeds.get<{ success: boolean } & FeedsSummary>("/summary", { params: { hours } });
    if (data.success) {
      return {
        period_hours: data.period_hours,
        alerts: data.alerts,
        tasks: data.tasks,
        metrics: data.metrics,
      };
    }
    return null;
  } catch (err) {
    console.error("getFeedsSummary error:", err);
    return null;
  }
}

/**
 * Atualiza status de um alerta (acknowledge, resolve).
 */
export async function updateFeedAlert(alertId: number, update: { status?: string; acknowledged_by?: string }): Promise<boolean> {
  try {
    const { data } = await apiFeeds.patch<{ success: boolean }>(`/alerts/${alertId}`, update);
    return data.success;
  } catch (err) {
    console.error("updateFeedAlert error:", err);
    return false;
  }
}

/**
 * Atualiza status de uma tarefa.
 */
export async function updateFeedTask(taskId: number, update: { status?: string; fault_code?: string; fault_message?: string }): Promise<boolean> {
  try {
    const { data } = await apiFeeds.patch<{ success: boolean }>(`/tasks/${taskId}`, update);
    return data.success;
  } catch (err) {
    console.error("updateFeedTask error:", err);
    return false;
  }
}

/**
 * Envia métricas para ingestão no backend.
 */
export async function ingestMetrics(deviceId: string, metrics: Record<string, any>, timestamp?: string): Promise<{ success: boolean; metric_id?: number }> {
  try {
    const payload: Record<string, any> = { device_id: deviceId, metrics };
    if (timestamp) payload.timestamp = timestamp;
    const { data } = await apiFeeds.post<{ success: boolean; metric_id?: number }>("/ingest", payload);
    return data;
  } catch (err) {
    console.error("ingestMetrics error:", err);
    return { success: false };
  }
}

/**
 * Envia alerta para o backend via webhook.
 */
export async function sendWebhookAlert(alert: {
  device_id?: string;
  severity: string;
  category: string;
  title: string;
  message?: string;
  details?: Record<string, any>;
}): Promise<{ success: boolean; alert_id?: number }> {
  try {
    const { data } = await axios.post<{ success: boolean; alert_id?: number }>("/webhook/alert", alert);
    return data;
  } catch (err) {
    console.error("sendWebhookAlert error:", err);
    return { success: false };
  }
}

/**
 * =========================
 *  AGREGA TUDO EM UM ÚNICO OBJETO (opcional)
 * =========================
 */
export const ponte = {
  // auth/health
  logIn, logOut, checkConnection,

  // devices
  fetchDevices, getDevices, getDeviceById, deleteDevice,

  // tasks
  getTasks, createTask, retryTask, deleteTask,

  // tags
  addTag, deleteTag,

  // presets/provisions/files
  createOrUpdatePreset, deletePreset, getPresets,
  createProvision, deleteProvision, getProvisions,
  uploadFile, deleteFile, getFiles,

  // count
  countDocuments,

  // IXC
  getIxcByLogin,
  getIxcClienteFullByLogin,

  // helpers
  humanizeSeconds,

  // quick actions
  rebootCPE, factoryResetCPE, refreshCPE, pushFileToCPE,
  setParameterValues, enviarDownloadDiagnostics, derrubarHost, gerarParametrosLanConfig,

  // diagnóstico
  pingCustom, traceroute, speedTest,
  whois, dnsResolve, arpScan, wanBandwidth, iperfClient,

  // feeds (GenieACS)
  getTasksRecent,
  getErrorsRecent,

  // feeds (Backend)
  getFeedsAlerts,
  getFeedsTasks,
  getFeedsMetrics,
  getFeedsSummary,
  updateFeedAlert,
  updateFeedTask,
  ingestMetrics,
  sendWebhookAlert,

  // analytics & IA
  getAnalyticsSummary,
  getDashboardOverview,
  predictLatency,
  analyzeWifiQuality,
};

// Re-export TR-069 API para uso direto
export * from "./tr069Api";
export { default as tr069Api } from "./tr069Api";
