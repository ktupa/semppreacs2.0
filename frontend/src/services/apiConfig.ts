// services/apiConfig.ts
// Configuração centralizada de APIs - resolve problemas de CORS

// Em desenvolvimento, usar proxy do Vite (caminho relativo)
// Em produção, usar a URL do backend
const isDev = import.meta.env.DEV;

// Base URL para APIs do backend FastAPI
// Quando acessado via Vite proxy, usar caminho relativo
// Quando em produção ou acesso direto, usar URL completa
export const API_BASE = isDev ? '' : (import.meta.env.VITE_API_BASE || '');

// GenieACS NBI
export const GENIE_API = isDev ? '/api-genie' : (import.meta.env.VITE_GENIE_API || 'http://localhost:7557');

// Funções helper para construir URLs
export const apiUrl = (path: string): string => {
  // Remover barra inicial duplicada
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE}${cleanPath}`;
};

// URLs específicas
export const mlApi = (path: string) => apiUrl(`/ml${path.startsWith('/') ? path : `/${path}`}`);
export const deviceApi = (deviceId: string, path: string) => {
  // Garantir que o deviceId está encodado para URLs
  const encodedId = encodeURIComponent(deviceId);
  return apiUrl(`/devices/${encodedId}${path.startsWith('/') ? path : `/${path}`}`);
};
export const provisioningApi = (path: string) => apiUrl(`/provisioning${path.startsWith('/') ? path : `/${path}`}`);
export const metricsApi = (path: string) => apiUrl(`/metrics${path.startsWith('/') ? path : `/${path}`}`);
export const genieApi = (path: string) => apiUrl(`/genie${path.startsWith('/') ? path : `/${path}`}`);

export default {
  API_BASE,
  GENIE_API,
  apiUrl,
  mlApi,
  deviceApi,
  provisioningApi,
  metricsApi,
  genieApi,
};
