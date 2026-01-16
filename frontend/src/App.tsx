import { ReactNode, useEffect, useState } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useNavigate,
} from "react-router-dom";
import { Spinner, Center } from "@chakra-ui/react";
import axios from "axios";

// Layout base
import { PainelLayout } from "./components/PainelLayout";

// Páginas principais
import LoginPage from "./pages/Login";
import Dispositivos from "./pages/Dispositivos";
import Logs from "./pages/Logs";
import Configuracoes from "./pages/Configuracoes";
import DispositivoDashboard from "./pages/DispositivoDashboard";
import Dashboard from "./pages/Dashboard";
import Usuarios from "./pages/Usuarios";

// Em dev, API_BASE vazio usa proxy do Vite; em prod deve apontar para backend
const API_BASE = import.meta.env.VITE_API_BASE || "";

// Rota privada com verificação JWT
type PrivateRouteProps = {
  children: ReactNode;
};

function PrivateRoute({ children }: PrivateRouteProps) {
  const [isValid, setIsValid] = useState<boolean | null>(null);
  const navigate = useNavigate();
  
  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem("token");
      
      if (!token) {
        setIsValid(false);
        return;
      }
      
      try {
        // Verificar token no backend (usa proxy /auth -> backend:8087)
        const res = await axios.get(`${API_BASE}/auth/verify`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        if (res.data?.valid) {
          setIsValid(true);
        } else {
          localStorage.removeItem("token");
          localStorage.removeItem("user");
          setIsValid(false);
        }
      } catch (err: any) {
        console.error("Auth verify failed:", err?.response?.status, err?.message);
        // Se endpoint não existe (404) ou erro de rede, aceitar token (backward compatibility)
        // Se 401/403, invalidar token
        if (err?.response?.status === 401 || err?.response?.status === 403) {
          localStorage.removeItem("token");
          localStorage.removeItem("user");
          setIsValid(false);
        } else {
          // Fallback: manter autenticado (compatibilidade com login antigo)
          setIsValid(true);
        }
      }
    };
    
    checkAuth();
  }, [navigate]);
  
  if (isValid === null) {
    return (
      <Center h="100vh" bg="gray.900">
        <Spinner size="xl" color="cyan.400" />
      </Center>
    );
  }
  
  if (!isValid) {
    return <Navigate to="/login" replace />;
  }
  
  return <>{children}</>;
}

// Componente wrapper para adicionar axios interceptor
function AppContent() {
  useEffect(() => {
    // Adicionar token em todas requisições
    const requestInterceptor = axios.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem("token");
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Interceptar erros 401
    const responseInterceptor = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          localStorage.removeItem("token");
          localStorage.removeItem("user");
          window.location.href = "/login";
        }
        return Promise.reject(error);
      }
    );

    return () => {
      axios.interceptors.request.eject(requestInterceptor);
      axios.interceptors.response.eject(responseInterceptor);
    };
  }, []);

  return (
    <Routes>
      {/* Login público */}
      <Route path="/login" element={<LoginPage />} />

      {/* Dashboard privada */}
      <Route
        path="/dashboard"
        element={
          <PrivateRoute>
            <PainelLayout>
              <Dashboard />
            </PainelLayout>
          </PrivateRoute>
        }
      />

      {/* Outras rotas privadas */}
      <Route
        path="/dispositivos"
        element={
          <PrivateRoute>
            <PainelLayout>
              <Dispositivos />
            </PainelLayout>
          </PrivateRoute>
        }
      />
      <Route
        path="/logs"
        element={
          <PrivateRoute>
            <PainelLayout>
              <Logs />
            </PainelLayout>
          </PrivateRoute>
        }
      />
      <Route
        path="/configuracoes"
        element={
          <PrivateRoute>
            <PainelLayout>
              <Configuracoes />
            </PainelLayout>
          </PrivateRoute>
        }
      />
      <Route
        path="/usuarios"
        element={
          <PrivateRoute>
            <PainelLayout>
              <Usuarios />
            </PainelLayout>
          </PrivateRoute>
        }
      />
      <Route
        path="/devices/:id"
        element={
          <PrivateRoute>
            <PainelLayout>
              <DispositivoDashboard />
            </PainelLayout>
          </PrivateRoute>
        }
      />

      {/* Redirecionamento padrão */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <Router
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <AppContent />
    </Router>
  );
}

