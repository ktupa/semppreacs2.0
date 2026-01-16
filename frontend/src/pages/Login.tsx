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
  Icon,
} from "@chakra-ui/react";
import { useNavigate } from "react-router-dom";
import { FaUser, FaLock, FaEye, FaEyeSlash } from "react-icons/fa";
import { FiWifi } from "react-icons/fi";
import axios from "axios";

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
      const res = await axios.post(`${API_BASE}/auth/login`, {
        username,
        password,
      });

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
      bgGradient="linear(to-br, gray.900, cyan.900, gray.900)"
    >
      <VStack flex="1" justify="center" align="center" p={{ base: 4, md: 8 }}>
        <VStack
          spacing={6}
          bg="gray.800"
          p={{ base: 6, md: 8 }}
          rounded="2xl"
          shadow="2xl"
          w="full"
          maxW="420px"
          border="2px solid"
          borderColor="cyan.700"
        >
          {/* Logo */}
          <VStack spacing={3}>
            <Box
              w="90px"
              h="90px"
              bg="linear-gradient(135deg, #0891b2 0%, #06b6d4 100%)"
              rounded="2xl"
              display="flex"
              alignItems="center"
              justifyContent="center"
              boxShadow="0 8px 32px rgba(6, 182, 212, 0.3)"
            >
              <Icon as={FiWifi} boxSize={10} color="white" />
            </Box>
            <Heading size="lg" color="white" fontWeight="bold">
              Semppre ACS
            </Heading>
            <Text color="cyan.200" fontSize="sm" fontWeight="medium">
              Sistema de Gerenciamento TR-069
            </Text>
          </VStack>

          <Divider borderColor="gray.600" />

          {/* Form */}
          <VStack spacing={5} w="full">
            <FormControl>
              <FormLabel color="cyan.200" fontSize="sm" fontWeight="bold">
                Usuário
              </FormLabel>
              <InputGroup>
                <InputLeftElement>
                  <Icon as={FaUser} color="cyan.400" />
                </InputLeftElement>
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Digite seu usuário"
                  bg="gray.700"
                  border="2px solid"
                  borderColor="gray.600"
                  color="white"
                  _hover={{ borderColor: "cyan.500" }}
                  _focus={{ borderColor: "cyan.400", boxShadow: "0 0 0 2px rgba(6, 182, 212, 0.3)" }}
                  _placeholder={{ color: "gray.400" }}
                />
              </InputGroup>
            </FormControl>

            <FormControl>
              <FormLabel color="cyan.200" fontSize="sm" fontWeight="bold">
                Senha
              </FormLabel>
              <InputGroup>
                <InputLeftElement>
                  <Icon as={FaLock} color="cyan.400" />
                </InputLeftElement>
                <Input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Digite sua senha"
                  bg="gray.700"
                  border="2px solid"
                  borderColor="gray.600"
                  color="white"
                  _hover={{ borderColor: "cyan.500" }}
                  _focus={{ borderColor: "cyan.400", boxShadow: "0 0 0 2px rgba(6, 182, 212, 0.3)" }}
                  _placeholder={{ color: "gray.400" }}
                />
                <InputRightElement>
                  <IconButton
                    aria-label="Toggle password"
                    icon={showPassword ? <FaEyeSlash /> : <FaEye />}
                    variant="ghost"
                    size="sm"
                    color="cyan.400"
                    _hover={{ color: "cyan.200", bg: "gray.600" }}
                    onClick={() => setShowPassword(!showPassword)}
                  />
                </InputRightElement>
              </InputGroup>
            </FormControl>

            <Button
              colorScheme="cyan"
              w="full"
              size="lg"
              onClick={handleLogin}
              isLoading={loading}
              loadingText="Entrando..."
              mt={2}
              fontWeight="bold"
              _hover={{ transform: "translateY(-2px)", boxShadow: "lg" }}
              transition="all 0.2s"
            >
              Entrar
            </Button>
          </VStack>

          <Divider borderColor="gray.600" />

          {/* Footer */}
          <VStack spacing={1}>
            <Text color="gray.400" fontSize="xs">
              © 2025 Semppre ACS - Marcos Vinicius
            </Text>
            <HStack spacing={2} fontSize="xs">
              <Link color="cyan.400" href="#" _hover={{ color: "cyan.200" }}>
                Suporte
              </Link>
              <Text color="gray.600">•</Text>
              <Link color="cyan.400" href="#" _hover={{ color: "cyan.200" }}>
                Documentação
              </Link>
            </HStack>
          </VStack>
        </VStack>
      </VStack>
    </Box>
  );
}
