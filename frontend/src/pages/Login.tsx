import { useState } from "react";
import {
  Box,
  Button,
  FormControl,
  FormLabel,
  Input,
  Heading,
  Text,
  VStack,
  useToast,
  InputGroup,
  InputLeftElement,
  InputRightElement,
  IconButton,
  HStack,
  Divider,
  Link,
} from "@chakra-ui/react";
import { useNavigate } from "react-router-dom";
import { FaUser, FaLock, FaEye, FaEyeSlash } from "react-icons/fa";
import axios from "axios";

// Usar URL relativa para passar pelo proxy do Vite
// Em prod, VITE_API_BASE pode apontar para o backend
const API_BASE = import.meta.env.VITE_API_BASE || "";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const toast = useToast();
  const navigate = useNavigate();

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      toast({
        title: "Campos obrigatórios",
        description: "Preencha usuário e senha",
        status: "warning",
        duration: 3000,
      });
      return;
    }

    setLoading(true);
    try {
      // Tentar novo endpoint JWT primeiro
      const res = await axios.post(`${API_BASE}/auth/login`, {
        username,
        password,
      });

      // Backend JWT retorna { access_token, token_type, expires_in, user }
      if (res?.data?.access_token) {
        localStorage.setItem("token", res.data.access_token);
        localStorage.setItem("user", JSON.stringify(res.data.user || {}));

        toast({
          title: "Login realizado!",
          description: `Bem-vindo, ${res.data.user?.username || username}!`,
          status: "success",
          duration: 2000,
        });
        navigate("/dashboard");
      } else {
        throw new Error("Token não recebido");
      }
    } catch (err) {
      // Fallback para login antigo do GenieACS
      try {
        const { logIn } = await import("../services/genieAcsApi");
        await logIn(username, password);
        toast({
          title: "Login feito com sucesso!",
          status: "success",
          duration: 2000,
        });
        navigate("/dashboard");
      } catch (fallbackErr: unknown) {
        const error = fallbackErr as { response?: { data?: { error?: string } } };
        toast({
          title: "Erro no login",
          description: error?.response?.data?.error || "Verifique seus dados",
          status: "error",
          duration: 3000,
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleLogin();
  };

  return (
    <Box
      minH="100vh"
      display="flex"
      flexDirection="column"
      bg="gray.900"
      bgGradient="linear(to-br, gray.900, purple.900, gray.900)"
    >
      <VStack flex="1" justify="center" align="center" p={{ base: 4, md: 8 }}>
        <VStack
          spacing={6}
          bg="gray.800"
          p={{ base: 6, md: 8 }}
          rounded="2xl"
          shadow="2xl"
          w="full"
          maxW="400px"
          border="1px solid"
          borderColor="whiteAlpha.100"
        >
          {/* Logo */}
          <VStack spacing={2}>
            <Box
              w="80px"
              h="80px"
              bg="teal.500"
              rounded="2xl"
              display="flex"
              alignItems="center"
              justifyContent="center"
              boxShadow="lg"
            >
              <Text fontSize="2xl" fontWeight="bold" color="white">
                ACS
              </Text>
            </Box>
            <Heading size="lg" color="white">
              Semppre ACS
            </Heading>
            <Text color="gray.400" fontSize="sm">
              Sistema de Gerenciamento TR-069
            </Text>
          </VStack>

          <Divider borderColor="whiteAlpha.200" />

          {/* Form */}
          <VStack spacing={4} w="full">
            <FormControl>
              <FormLabel color="gray.300" fontSize="sm">
                Usuário
              </FormLabel>
              <InputGroup>
                <InputLeftElement>
                  <FaUser color="gray" />
                </InputLeftElement>
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Digite seu usuário"
                  bg="gray.700"
                  border="1px solid"
                  borderColor="whiteAlpha.200"
                  color="white"
                  _focus={{ borderColor: "teal.400" }}
                  _placeholder={{ color: "gray.500" }}
                />
              </InputGroup>
            </FormControl>

            <FormControl>
              <FormLabel color="gray.300" fontSize="sm">
                Senha
              </FormLabel>
              <InputGroup>
                <InputLeftElement>
                  <FaLock color="gray" />
                </InputLeftElement>
                <Input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Digite sua senha"
                  bg="gray.700"
                  border="1px solid"
                  borderColor="whiteAlpha.200"
                  color="white"
                  _focus={{ borderColor: "teal.400" }}
                  _placeholder={{ color: "gray.500" }}
                />
                <InputRightElement>
                  <IconButton
                    aria-label="Toggle password"
                    icon={showPassword ? <FaEyeSlash /> : <FaEye />}
                    variant="ghost"
                    colorScheme="gray"
                    size="sm"
                    onClick={() => setShowPassword(!showPassword)}
                  />
                </InputRightElement>
              </InputGroup>
            </FormControl>

            <Button
              colorScheme="teal"
              w="full"
              size="lg"
              onClick={handleLogin}
              isLoading={loading}
              loadingText="Entrando..."
              mt={2}
            >
              Entrar
            </Button>
          </VStack>

          <Divider borderColor="whiteAlpha.200" />

          {/* Footer */}
          <VStack spacing={1}>
            <Text color="gray.500" fontSize="xs">
              © 2025 Semppre ACS - Marcos Vinicius
            </Text>
            <HStack spacing={2} fontSize="xs">
              <Link color="teal.400" href="#">
                Suporte
              </Link>
              <Text color="gray.600">•</Text>
              <Link color="teal.400" href="#">
                Documentação
              </Link>
            </HStack>
          </VStack>
        </VStack>
      </VStack>
    </Box>
  );
}

