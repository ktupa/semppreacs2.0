// src/pages/Usuarios.tsx - Redesenhado com melhor contraste e UX
import { useState, useEffect, useCallback, useRef } from "react";
import {
  Box,
  Button,
  Flex,
  Heading,
  Text,
  VStack,
  HStack,
  Input,
  Select,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Badge,
  IconButton,
  useDisclosure,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  FormControl,
  FormLabel,
  Switch,
  Checkbox,
  CheckboxGroup,
  SimpleGrid,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  useToast,
  Spinner,
  AlertDialog,
  AlertDialogBody,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogContent,
  AlertDialogOverlay,
  Stat,
  StatLabel,
  StatNumber,
  Textarea,
  Tooltip,
  InputGroup,
  InputRightElement,
  Avatar,
  Divider,
  Icon,
  Grid,
  GridItem,
} from "@chakra-ui/react";
import {
  FiPlus,
  FiEdit2,
  FiTrash2,
  FiKey,
  FiUsers,
  FiShield,
  FiEye,
  FiEyeOff,
  FiSearch,
  FiRefreshCw,
  FiUserCheck,
  FiUserX,
  FiCheckCircle,
  FiXCircle,
} from "react-icons/fi";
import axios from "axios";

const API_BASE = import.meta.env.VITE_API_BASE || "";

// ============ Types ============
interface User {
  id: string;
  username: string;
  email: string;
  full_name: string | null;
  group_id: string;
  group_name: string;
  permissions: string[];
  is_active: boolean;
  created_at: string;
  last_login: string | null;
}

interface Group {
  id: string;
  name: string;
  description: string | null;
  permissions: string[];
  created_at: string;
  is_system: boolean;
  user_count: number;
}

interface PermissionCategory {
  category: string;
  permissions: { [key: string]: string };
}

interface Stats {
  total_users: number;
  active_users: number;
  inactive_users: number;
  total_groups: number;
  users_by_group: { [key: string]: number };
}

// ============ Component ============
export default function Usuarios() {
  const toast = useToast();
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Data state
  const [users, setUsers] = useState<User[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [permissions, setPermissions] = useState<PermissionCategory[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [myPermissions, setMyPermissions] = useState<string[]>([]);

  // UI state
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterGroup, setFilterGroup] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  // User modal
  const {
    isOpen: isUserModalOpen,
    onOpen: onUserModalOpen,
    onClose: onUserModalClose,
  } = useDisclosure();
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userForm, setUserForm] = useState({
    username: "",
    email: "",
    password: "",
    full_name: "",
    group_id: "operator",
    is_active: true,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [savingUser, setSavingUser] = useState(false);

  // Group modal
  const {
    isOpen: isGroupModalOpen,
    onOpen: onGroupModalOpen,
    onClose: onGroupModalClose,
  } = useDisclosure();
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [groupForm, setGroupForm] = useState({
    name: "",
    description: "",
    permissions: [] as string[],
  });
  const [savingGroup, setSavingGroup] = useState(false);

  // Reset password modal
  const {
    isOpen: isResetModalOpen,
    onOpen: onResetModalOpen,
    onClose: onResetModalClose,
  } = useDisclosure();
  const [resetUser, setResetUser] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState("123456");
  const [resetting, setResetting] = useState(false);

  // Delete confirmation
  const {
    isOpen: isDeleteOpen,
    onOpen: onDeleteOpen,
    onClose: onDeleteClose,
  } = useDisclosure();
  const [deleteTarget, setDeleteTarget] = useState<{
    type: "user" | "group";
    item: User | Group;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ============ Data Fetching ============
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [usersRes, groupsRes, permsRes, statsRes, myPermsRes] =
        await Promise.all([
          axios.get(`${API_BASE}/users-management/users`),
          axios.get(`${API_BASE}/users-management/groups`),
          axios.get(`${API_BASE}/users-management/permissions`),
          axios.get(`${API_BASE}/users-management/stats`),
          axios.get(`${API_BASE}/users-management/my-permissions`),
        ]);

      setUsers(Array.isArray(usersRes.data) ? usersRes.data : []);
      setGroups(Array.isArray(groupsRes.data) ? groupsRes.data : []);
      setPermissions(Array.isArray(permsRes.data) ? permsRes.data : []);
      setStats(statsRes.data);
      setMyPermissions(Array.isArray(myPermsRes.data) ? myPermsRes.data : []);
    } catch (err: any) {
      console.error("Erro ao carregar dados:", err);
      setUsers([]);
      setGroups([]);
      setPermissions([]);
      setMyPermissions([]);
      toast({
        title: "Erro ao carregar dados",
        description: err.response?.data?.detail || err.message,
        status: "error",
        duration: 5000,
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ============ Permission Helpers ============
  const hasPermission = (perm: string) => {
    return myPermissions.includes("*") || myPermissions.includes(perm);
  };

  // ============ User CRUD ============
  const openUserModal = (user?: User) => {
    if (user) {
      setEditingUser(user);
      setUserForm({
        username: user.username,
        email: user.email,
        password: "",
        full_name: user.full_name || "",
        group_id: user.group_id,
        is_active: user.is_active,
      });
    } else {
      setEditingUser(null);
      setUserForm({
        username: "",
        email: "",
        password: "",
        full_name: "",
        group_id: "operator",
        is_active: true,
      });
    }
    setShowPassword(false);
    onUserModalOpen();
  };

  const saveUser = async () => {
    setSavingUser(true);
    try {
      if (editingUser) {
        await axios.put(
          `${API_BASE}/users-management/users/${editingUser.username}`,
          {
            email: userForm.email,
            full_name: userForm.full_name || null,
            group_id: userForm.group_id,
            is_active: userForm.is_active,
          }
        );
        toast({
          title: "Usuário atualizado com sucesso!",
          status: "success",
          duration: 3000,
        });
      } else {
        if (!userForm.password) {
          toast({
            title: "Senha obrigatória",
            description: "Informe uma senha para o novo usuário",
            status: "warning",
            duration: 3000,
          });
          setSavingUser(false);
          return;
        }
        await axios.post(`${API_BASE}/users-management/users`, {
          username: userForm.username,
          email: userForm.email,
          password: userForm.password,
          full_name: userForm.full_name || null,
          group_id: userForm.group_id,
          is_active: userForm.is_active,
        });
        toast({
          title: "Usuário criado com sucesso!",
          status: "success",
          duration: 3000,
        });
      }
      onUserModalClose();
      fetchData();
    } catch (err: any) {
      toast({
        title: "Erro ao salvar usuário",
        description: err.response?.data?.detail || err.message,
        status: "error",
        duration: 5000,
      });
    } finally {
      setSavingUser(false);
    }
  };

  // ============ Reset Password ============
  const openResetModal = (user: User) => {
    setResetUser(user);
    setNewPassword("123456");
    onResetModalOpen();
  };

  const resetPassword = async () => {
    if (!resetUser) return;
    setResetting(true);
    try {
      await axios.post(
        `${API_BASE}/users-management/users/${resetUser.username}/reset-password`,
        null,
        { params: { new_password: newPassword } }
      );
      toast({
        title: "Senha resetada com sucesso!",
        description: `Nova senha: ${newPassword}`,
        status: "success",
        duration: 5000,
      });
      onResetModalClose();
    } catch (err: any) {
      toast({
        title: "Erro ao resetar senha",
        description: err.response?.data?.detail || err.message,
        status: "error",
        duration: 5000,
      });
    } finally {
      setResetting(false);
    }
  };

  // ============ Group CRUD ============
  const openGroupModal = (group?: Group) => {
    if (group) {
      setEditingGroup(group);
      setGroupForm({
        name: group.name,
        description: group.description || "",
        permissions: [...group.permissions],
      });
    } else {
      setEditingGroup(null);
      setGroupForm({
        name: "",
        description: "",
        permissions: [],
      });
    }
    onGroupModalOpen();
  };

  const saveGroup = async () => {
    setSavingGroup(true);
    try {
      if (editingGroup) {
        await axios.put(
          `${API_BASE}/users-management/groups/${editingGroup.id}`,
          {
            name: editingGroup.is_system ? undefined : groupForm.name,
            description: groupForm.description,
            permissions: groupForm.permissions,
          }
        );
        toast({
          title: "Grupo atualizado com sucesso!",
          status: "success",
          duration: 3000,
        });
      } else {
        await axios.post(`${API_BASE}/users-management/groups`, {
          name: groupForm.name,
          description: groupForm.description,
          permissions: groupForm.permissions,
        });
        toast({
          title: "Grupo criado com sucesso!",
          status: "success",
          duration: 3000,
        });
      }
      onGroupModalClose();
      fetchData();
    } catch (err: any) {
      toast({
        title: "Erro ao salvar grupo",
        description: err.response?.data?.detail || err.message,
        status: "error",
        duration: 5000,
      });
    } finally {
      setSavingGroup(false);
    }
  };

  // ============ Delete ============
  const confirmDelete = (type: "user" | "group", item: User | Group) => {
    setDeleteTarget({ type, item });
    onDeleteOpen();
  };

  const executeDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if (deleteTarget.type === "user") {
        await axios.delete(
          `${API_BASE}/users-management/users/${(deleteTarget.item as User).username}`
        );
        toast({
          title: "Usuário removido com sucesso!",
          status: "success",
          duration: 3000,
        });
      } else {
        await axios.delete(
          `${API_BASE}/users-management/groups/${(deleteTarget.item as Group).id}`
        );
        toast({
          title: "Grupo removido com sucesso!",
          status: "success",
          duration: 3000,
        });
      }
      onDeleteClose();
      fetchData();
    } catch (err: any) {
      toast({
        title: "Erro ao remover",
        description: err.response?.data?.detail || err.message,
        status: "error",
        duration: 5000,
      });
    } finally {
      setDeleting(false);
    }
  };

  // ============ Filtering ============
  const filteredUsers = Array.isArray(users)
    ? users.filter((u) => {
        const matchSearch =
          !searchTerm ||
          u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
          u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (u.full_name?.toLowerCase() || "").includes(searchTerm.toLowerCase());
        const matchGroup = !filterGroup || u.group_id === filterGroup;
        const matchStatus =
          !filterStatus ||
          (filterStatus === "active" && u.is_active) ||
          (filterStatus === "inactive" && !u.is_active);
        return matchSearch && matchGroup && matchStatus;
      })
    : [];

  // ============ Rendering ============
  if (loading) {
    return (
      <Box bg="gray.900" minH="100vh" display="flex" alignItems="center" justifyContent="center">
        <VStack spacing={4}>
          <Spinner size="xl" color="cyan.400" thickness="4px" />
          <Text color="white" fontSize="lg" fontWeight="medium">Carregando usuários...</Text>
        </VStack>
      </Box>
    );
  }

  return (
    <Box bg="gray.900" minH="100vh" p={6}>
      {/* Header */}
      <Flex justify="space-between" align="center" mb={8}>
        <HStack spacing={4}>
          <Box p={3} bg="cyan.500" borderRadius="xl">
            <Icon as={FiUsers} boxSize={6} color="white" />
          </Box>
          <VStack align="start" spacing={0}>
            <Heading size="lg" color="white" fontWeight="bold">
              Gerenciamento de Usuários
            </Heading>
            <Text color="cyan.200" fontSize="sm">
              Gerencie usuários, grupos e permissões do sistema
            </Text>
          </VStack>
        </HStack>
        <Button
          leftIcon={<FiRefreshCw />}
          variant="outline"
          colorScheme="cyan"
          onClick={fetchData}
          color="cyan.300"
          borderColor="cyan.600"
          _hover={{ bg: "cyan.900", borderColor: "cyan.400" }}
        >
          Atualizar
        </Button>
      </Flex>

      {/* Stats Cards */}
      {stats && (
        <Grid templateColumns={{ base: "1fr", md: "repeat(4, 1fr)" }} gap={4} mb={8}>
          <GridItem>
            <Box
              bg="linear-gradient(135deg, #1a365d 0%, #2a4365 100%)"
              p={5}
              borderRadius="xl"
              border="1px solid"
              borderColor="blue.600"
              boxShadow="lg"
              _hover={{ transform: "translateY(-2px)", boxShadow: "xl" }}
              transition="all 0.2s"
            >
              <HStack spacing={4}>
                <Box p={3} bg="blue.500" borderRadius="lg" boxShadow="md">
                  <Icon as={FiUsers} boxSize={5} color="white" />
                </Box>
                <Stat>
                  <StatLabel color="blue.100" fontSize="sm" fontWeight="semibold">
                    Total de Usuários
                  </StatLabel>
                  <StatNumber color="white" fontSize="2xl" fontWeight="bold">
                    {stats.total_users}
                  </StatNumber>
                </Stat>
              </HStack>
            </Box>
          </GridItem>

          <GridItem>
            <Box
              bg="linear-gradient(135deg, #1c4532 0%, #22543d 100%)"
              p={5}
              borderRadius="xl"
              border="1px solid"
              borderColor="green.500"
              boxShadow="lg"
              _hover={{ transform: "translateY(-2px)", boxShadow: "xl" }}
              transition="all 0.2s"
            >
              <HStack spacing={4}>
                <Box p={3} bg="green.500" borderRadius="lg" boxShadow="md">
                  <Icon as={FiUserCheck} boxSize={5} color="white" />
                </Box>
                <Stat>
                  <StatLabel color="green.100" fontSize="sm" fontWeight="semibold">
                    Usuários Ativos
                  </StatLabel>
                  <StatNumber color="white" fontSize="2xl" fontWeight="bold">
                    {stats.active_users}
                  </StatNumber>
                </Stat>
              </HStack>
            </Box>
          </GridItem>

          <GridItem>
            <Box
              bg="linear-gradient(135deg, #63171b 0%, #822727 100%)"
              p={5}
              borderRadius="xl"
              border="1px solid"
              borderColor="red.500"
              boxShadow="lg"
              _hover={{ transform: "translateY(-2px)", boxShadow: "xl" }}
              transition="all 0.2s"
            >
              <HStack spacing={4}>
                <Box p={3} bg="red.500" borderRadius="lg" boxShadow="md">
                  <Icon as={FiUserX} boxSize={5} color="white" />
                </Box>
                <Stat>
                  <StatLabel color="red.100" fontSize="sm" fontWeight="semibold">
                    Usuários Inativos
                  </StatLabel>
                  <StatNumber color="white" fontSize="2xl" fontWeight="bold">
                    {stats.inactive_users}
                  </StatNumber>
                </Stat>
              </HStack>
            </Box>
          </GridItem>

          <GridItem>
            <Box
              bg="linear-gradient(135deg, #44337a 0%, #553c9a 100%)"
              p={5}
              borderRadius="xl"
              border="1px solid"
              borderColor="purple.500"
              boxShadow="lg"
              _hover={{ transform: "translateY(-2px)", boxShadow: "xl" }}
              transition="all 0.2s"
            >
              <HStack spacing={4}>
                <Box p={3} bg="purple.500" borderRadius="lg" boxShadow="md">
                  <Icon as={FiShield} boxSize={5} color="white" />
                </Box>
                <Stat>
                  <StatLabel color="purple.100" fontSize="sm" fontWeight="semibold">
                    Grupos
                  </StatLabel>
                  <StatNumber color="white" fontSize="2xl" fontWeight="bold">
                    {stats.total_groups}
                  </StatNumber>
                </Stat>
              </HStack>
            </Box>
          </GridItem>
        </Grid>
      )}

      {/* Tabs */}
      <Tabs variant="soft-rounded" colorScheme="cyan">
        <TabList bg="gray.800" p={2} borderRadius="xl" w="fit-content" mb={6} border="1px solid" borderColor="gray.700">
          <Tab
            _selected={{ bg: "cyan.500", color: "white" }}
            color="gray.300"
            fontWeight="semibold"
            _hover={{ color: "white" }}
          >
            <HStack spacing={2}>
              <FiUsers />
              <Text>Usuários</Text>
            </HStack>
          </Tab>
          <Tab
            _selected={{ bg: "cyan.500", color: "white" }}
            color="gray.300"
            fontWeight="semibold"
            _hover={{ color: "white" }}
          >
            <HStack spacing={2}>
              <FiShield />
              <Text>Grupos</Text>
            </HStack>
          </Tab>
        </TabList>

        <TabPanels>
          {/* ============ Users Tab ============ */}
          <TabPanel p={0}>
            <Box bg="gray.800" borderRadius="xl" overflow="hidden" border="1px solid" borderColor="gray.600">
              {/* Filters */}
              <Flex p={4} gap={4} wrap="wrap" align="center" borderBottom="1px solid" borderColor="gray.600" bg="gray.750">
                <InputGroup maxW="300px">
                  <Input
                    placeholder="Buscar por nome ou email..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    bg="gray.700"
                    border="2px solid"
                    borderColor="gray.500"
                    color="white"
                    _placeholder={{ color: "gray.400" }}
                    _hover={{ borderColor: "cyan.500" }}
                    _focus={{ borderColor: "cyan.400", boxShadow: "0 0 0 1px #00B5D8" }}
                  />
                  <InputRightElement>
                    <FiSearch color="#A0AEC0" />
                  </InputRightElement>
                </InputGroup>

                <Select
                  placeholder="Todos os grupos"
                  value={filterGroup}
                  onChange={(e) => setFilterGroup(e.target.value)}
                  maxW="200px"
                  bg="gray.700"
                  border="2px solid"
                  borderColor="gray.500"
                  color="white"
                  _hover={{ borderColor: "cyan.500" }}
                >
                  {groups.map((g) => (
                    <option key={g.id} value={g.id} style={{ background: "#2D3748", color: "white" }}>
                      {g.name}
                    </option>
                  ))}
                </Select>

                <Select
                  placeholder="Todos os status"
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  maxW="180px"
                  bg="gray.700"
                  border="2px solid"
                  borderColor="gray.500"
                  color="white"
                  _hover={{ borderColor: "cyan.500" }}
                >
                  <option value="active" style={{ background: "#2D3748", color: "white" }}>Ativos</option>
                  <option value="inactive" style={{ background: "#2D3748", color: "white" }}>Inativos</option>
                </Select>

                <Box flex={1} />

                {hasPermission("users.create") && (
                  <Button
                    leftIcon={<FiPlus />}
                    colorScheme="cyan"
                    onClick={() => openUserModal()}
                    fontWeight="bold"
                    size="md"
                    boxShadow="md"
                  >
                    Novo Usuário
                  </Button>
                )}
              </Flex>

              {/* Users Table */}
              <Box overflowX="auto">
                <Table variant="simple">
                  <Thead bg="gray.700">
                    <Tr>
                      <Th color="cyan.200" fontWeight="bold" fontSize="xs" textTransform="uppercase" letterSpacing="wider" py={4} borderColor="gray.600">
                        Usuário
                      </Th>
                      <Th color="cyan.200" fontWeight="bold" fontSize="xs" textTransform="uppercase" letterSpacing="wider" borderColor="gray.600">
                        Email
                      </Th>
                      <Th color="cyan.200" fontWeight="bold" fontSize="xs" textTransform="uppercase" letterSpacing="wider" borderColor="gray.600">
                        Nome Completo
                      </Th>
                      <Th color="cyan.200" fontWeight="bold" fontSize="xs" textTransform="uppercase" letterSpacing="wider" borderColor="gray.600">
                        Grupo
                      </Th>
                      <Th color="cyan.200" fontWeight="bold" fontSize="xs" textTransform="uppercase" letterSpacing="wider" borderColor="gray.600">
                        Status
                      </Th>
                      <Th color="cyan.200" fontWeight="bold" fontSize="xs" textTransform="uppercase" letterSpacing="wider" borderColor="gray.600">
                        Último Login
                      </Th>
                      <Th color="cyan.200" fontWeight="bold" fontSize="xs" textTransform="uppercase" letterSpacing="wider" textAlign="right" borderColor="gray.600">
                        Ações
                      </Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {filteredUsers.map((user, idx) => (
                      <Tr
                        key={user.id}
                        bg={idx % 2 === 0 ? "gray.800" : "gray.750"}
                        _hover={{ bg: "gray.700" }}
                        borderBottom="1px solid"
                        borderColor="gray.600"
                        transition="background 0.2s"
                      >
                        <Td py={4} borderColor="gray.600">
                          <HStack spacing={3}>
                            <Avatar
                              size="sm"
                              name={user.full_name || user.username}
                              bg={user.is_active ? "cyan.500" : "gray.500"}
                              color="white"
                            />
                            <Text color="white" fontWeight="bold">
                              {user.username}
                            </Text>
                          </HStack>
                        </Td>
                        <Td borderColor="gray.600">
                          <Text color="gray.100">{user.email}</Text>
                        </Td>
                        <Td borderColor="gray.600">
                          <Text color="gray.100">{user.full_name || "—"}</Text>
                        </Td>
                        <Td borderColor="gray.600">
                          <Badge
                            px={3}
                            py={1}
                            borderRadius="full"
                            fontWeight="bold"
                            fontSize="xs"
                            bg={
                              user.group_id === "admin"
                                ? "purple.500"
                                : user.group_id === "operator"
                                ? "blue.500"
                                : "gray.500"
                            }
                            color="white"
                            textTransform="uppercase"
                          >
                            {user.group_name}
                          </Badge>
                        </Td>
                        <Td borderColor="gray.600">
                          <Badge
                            px={3}
                            py={1}
                            borderRadius="full"
                            fontWeight="bold"
                            fontSize="xs"
                            bg={user.is_active ? "green.500" : "red.500"}
                            color="white"
                          >
                            <HStack spacing={1}>
                              <Icon as={user.is_active ? FiCheckCircle : FiXCircle} boxSize={3} />
                              <Text>{user.is_active ? "Ativo" : "Inativo"}</Text>
                            </HStack>
                          </Badge>
                        </Td>
                        <Td borderColor="gray.600">
                          <Text color="gray.200" fontSize="sm">
                            {user.last_login
                              ? new Date(user.last_login).toLocaleString("pt-BR")
                              : "Nunca acessou"}
                          </Text>
                        </Td>
                        <Td textAlign="right" borderColor="gray.600">
                          <HStack justify="flex-end" spacing={1}>
                            {hasPermission("users.edit") && (
                              <>
                                <Tooltip label="Editar usuário" hasArrow bg="cyan.600">
                                  <IconButton
                                    icon={<FiEdit2 />}
                                    aria-label="Editar"
                                    size="sm"
                                    variant="ghost"
                                    color="cyan.300"
                                    _hover={{ bg: "cyan.900", color: "cyan.100" }}
                                    onClick={() => openUserModal(user)}
                                  />
                                </Tooltip>
                                <Tooltip label="Resetar senha" hasArrow bg="yellow.600">
                                  <IconButton
                                    icon={<FiKey />}
                                    aria-label="Resetar Senha"
                                    size="sm"
                                    variant="ghost"
                                    color="yellow.300"
                                    _hover={{ bg: "yellow.900", color: "yellow.100" }}
                                    onClick={() => openResetModal(user)}
                                  />
                                </Tooltip>
                              </>
                            )}
                            {hasPermission("users.delete") && user.username !== "admin" && (
                              <Tooltip label="Remover usuário" hasArrow bg="red.600">
                                <IconButton
                                  icon={<FiTrash2 />}
                                  aria-label="Remover"
                                  size="sm"
                                  variant="ghost"
                                  color="red.300"
                                  _hover={{ bg: "red.900", color: "red.100" }}
                                  onClick={() => confirmDelete("user", user)}
                                />
                              </Tooltip>
                            )}
                          </HStack>
                        </Td>
                      </Tr>
                    ))}
                    {filteredUsers.length === 0 && (
                      <Tr>
                        <Td colSpan={7} py={12} textAlign="center" borderColor="gray.600">
                          <VStack spacing={3}>
                            <Icon as={FiUsers} boxSize={10} color="gray.500" />
                            <Text color="gray.300" fontSize="lg" fontWeight="medium">
                              Nenhum usuário encontrado
                            </Text>
                            <Text color="gray.400" fontSize="sm">
                              Tente ajustar os filtros ou criar um novo usuário
                            </Text>
                          </VStack>
                        </Td>
                      </Tr>
                    )}
                  </Tbody>
                </Table>
              </Box>
            </Box>
          </TabPanel>

          {/* ============ Groups Tab ============ */}
          <TabPanel p={0}>
            <Box bg="gray.800" borderRadius="xl" p={6} border="1px solid" borderColor="gray.600">
              <Flex mb={6} justify="space-between" align="center">
                <VStack align="start" spacing={1}>
                  <Text color="white" fontWeight="bold" fontSize="xl">
                    Grupos de Permissões
                  </Text>
                  <Text color="cyan.200" fontSize="sm">
                    Configure as permissões de cada grupo de usuários
                  </Text>
                </VStack>
                {hasPermission("groups.create") && (
                  <Button
                    leftIcon={<FiPlus />}
                    colorScheme="cyan"
                    onClick={() => openGroupModal()}
                    fontWeight="bold"
                    boxShadow="md"
                  >
                    Novo Grupo
                  </Button>
                )}
              </Flex>

              <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={4}>
                {groups.map((group) => (
                  <Box
                    key={group.id}
                    bg="gray.700"
                    p={5}
                    borderRadius="xl"
                    border="2px solid"
                    borderColor="gray.500"
                    _hover={{ borderColor: "cyan.500", transform: "translateY(-2px)", boxShadow: "lg" }}
                    transition="all 0.2s"
                  >
                    <Flex justify="space-between" align="start" mb={4}>
                      <HStack spacing={3}>
                        <Box p={2} bg="cyan.500" borderRadius="lg">
                          <Icon as={FiShield} boxSize={4} color="white" />
                        </Box>
                        <VStack align="start" spacing={0}>
                          <HStack>
                            <Text color="white" fontWeight="bold" fontSize="lg">
                              {group.name}
                            </Text>
                            {group.is_system && (
                              <Badge colorScheme="blue" fontSize="2xs" variant="solid">
                                Sistema
                              </Badge>
                            )}
                          </HStack>
                          <Text color="gray.300" fontSize="sm">
                            {group.description || "Sem descrição"}
                          </Text>
                        </VStack>
                      </HStack>
                      <HStack>
                        {hasPermission("groups.edit") && (
                          <IconButton
                            icon={<FiEdit2 />}
                            aria-label="Editar"
                            size="sm"
                            variant="ghost"
                            color="cyan.300"
                            _hover={{ bg: "cyan.900", color: "cyan.100" }}
                            onClick={() => openGroupModal(group)}
                          />
                        )}
                        {hasPermission("groups.delete") && !group.is_system && (
                          <IconButton
                            icon={<FiTrash2 />}
                            aria-label="Remover"
                            size="sm"
                            variant="ghost"
                            color="red.300"
                            _hover={{ bg: "red.900", color: "red.100" }}
                            onClick={() => confirmDelete("group", group)}
                          />
                        )}
                      </HStack>
                    </Flex>

                    <HStack mb={4} spacing={2}>
                      <Badge
                        px={3}
                        py={1}
                        borderRadius="full"
                        bg="cyan.500"
                        color="white"
                        fontSize="xs"
                        fontWeight="bold"
                      >
                        {group.user_count} usuário(s)
                      </Badge>
                      <Badge
                        px={3}
                        py={1}
                        borderRadius="full"
                        bg="purple.500"
                        color="white"
                        fontSize="xs"
                        fontWeight="bold"
                      >
                        {group.permissions.includes("*")
                          ? "Todas"
                          : group.permissions.length}{" "}
                        permissões
                      </Badge>
                    </HStack>

                    {group.permissions.includes("*") ? (
                      <HStack spacing={2} p={3} bg="yellow.600" borderRadius="lg">
                        <Text fontSize="lg">⭐</Text>
                        <Text color="white" fontSize="sm" fontWeight="bold">
                          Acesso total ao sistema
                        </Text>
                      </HStack>
                    ) : (
                      <Box>
                        <Flex wrap="wrap" gap={1}>
                          {group.permissions.slice(0, 4).map((perm) => (
                            <Badge
                              key={perm}
                              px={2}
                              py={0.5}
                              bg="gray.600"
                              color="gray.100"
                              fontSize="2xs"
                              borderRadius="md"
                              fontWeight="medium"
                            >
                              {perm}
                            </Badge>
                          ))}
                          {group.permissions.length > 4 && (
                            <Badge
                              px={2}
                              py={0.5}
                              bg="gray.500"
                              color="white"
                              fontSize="2xs"
                              borderRadius="md"
                              fontWeight="medium"
                            >
                              +{group.permissions.length - 4} mais
                            </Badge>
                          )}
                        </Flex>
                      </Box>
                    )}
                  </Box>
                ))}
              </SimpleGrid>
            </Box>
          </TabPanel>
        </TabPanels>
      </Tabs>

      {/* ============ User Modal ============ */}
      <Modal isOpen={isUserModalOpen} onClose={onUserModalClose} size="lg" isCentered>
        <ModalOverlay bg="blackAlpha.800" backdropFilter="blur(8px)" />
        <ModalContent bg="gray.800" border="2px solid" borderColor="cyan.600">
          <ModalHeader color="white" borderBottom="2px solid" borderColor="gray.600" bg="gray.700" borderTopRadius="md">
            <HStack>
              <Icon as={editingUser ? FiEdit2 : FiPlus} color="cyan.400" />
              <Text>{editingUser ? "Editar Usuário" : "Novo Usuário"}</Text>
            </HStack>
          </ModalHeader>
          <ModalCloseButton color="white" _hover={{ bg: "gray.600" }} />
          <ModalBody py={6} bg="gray.800">
            <VStack spacing={5}>
              <FormControl isRequired>
                <FormLabel color="cyan.200" fontSize="sm" fontWeight="bold">
                  Nome de Usuário
                </FormLabel>
                <InputGroup>
                  <Input
                    value={userForm.username}
                    onChange={(e) =>
                      setUserForm({ ...userForm, username: e.target.value })
                    }
                    isDisabled={!!editingUser}
                    placeholder="Digite o nome de usuário"
                    bg="gray.700"
                    border="2px solid"
                    borderColor="gray.500"
                    color="white"
                    _placeholder={{ color: "gray.400" }}
                    _hover={{ borderColor: "cyan.500" }}
                    _focus={{ borderColor: "cyan.400", boxShadow: "0 0 0 2px rgba(0, 181, 216, 0.4)" }}
                    _disabled={{ opacity: 0.7, cursor: "not-allowed", bg: "gray.600" }}
                  />
                </InputGroup>
              </FormControl>

              <FormControl isRequired>
                <FormLabel color="cyan.200" fontSize="sm" fontWeight="bold">
                  Email
                </FormLabel>
                <InputGroup>
                  <Input
                    type="email"
                    value={userForm.email}
                    onChange={(e) =>
                      setUserForm({ ...userForm, email: e.target.value })
                    }
                    placeholder="email@exemplo.com"
                    bg="gray.700"
                    border="2px solid"
                    borderColor="gray.500"
                    color="white"
                    _placeholder={{ color: "gray.400" }}
                    _hover={{ borderColor: "cyan.500" }}
                    _focus={{ borderColor: "cyan.400", boxShadow: "0 0 0 2px rgba(0, 181, 216, 0.4)" }}
                  />
                </InputGroup>
              </FormControl>

              {!editingUser && (
                <FormControl isRequired>
                  <FormLabel color="cyan.200" fontSize="sm" fontWeight="bold">
                    Senha
                  </FormLabel>
                  <InputGroup>
                    <Input
                      type={showPassword ? "text" : "password"}
                      value={userForm.password}
                      onChange={(e) =>
                        setUserForm({ ...userForm, password: e.target.value })
                      }
                      placeholder="Digite uma senha segura"
                      bg="gray.700"
                      border="2px solid"
                      borderColor="gray.500"
                      color="white"
                      _placeholder={{ color: "gray.400" }}
                      _hover={{ borderColor: "cyan.500" }}
                      _focus={{ borderColor: "cyan.400", boxShadow: "0 0 0 2px rgba(0, 181, 216, 0.4)" }}
                    />
                    <InputRightElement>
                      <IconButton
                        variant="ghost"
                        size="sm"
                        aria-label={showPassword ? "Ocultar" : "Mostrar"}
                        icon={showPassword ? <FiEyeOff /> : <FiEye />}
                        onClick={() => setShowPassword(!showPassword)}
                        color="cyan.300"
                        _hover={{ color: "white", bg: "gray.600" }}
                      />
                    </InputRightElement>
                  </InputGroup>
                </FormControl>
              )}

              <FormControl>
                <FormLabel color="cyan.200" fontSize="sm" fontWeight="bold">
                  Nome Completo
                </FormLabel>
                <Input
                  value={userForm.full_name}
                  onChange={(e) =>
                    setUserForm({ ...userForm, full_name: e.target.value })
                  }
                  placeholder="Nome completo (opcional)"
                  bg="gray.700"
                  border="2px solid"
                  borderColor="gray.500"
                  color="white"
                  _placeholder={{ color: "gray.400" }}
                  _hover={{ borderColor: "cyan.500" }}
                  _focus={{ borderColor: "cyan.400", boxShadow: "0 0 0 2px rgba(0, 181, 216, 0.4)" }}
                />
              </FormControl>

              <FormControl isRequired>
                <FormLabel color="cyan.200" fontSize="sm" fontWeight="bold">
                  Grupo
                </FormLabel>
                <Select
                  value={userForm.group_id}
                  onChange={(e) =>
                    setUserForm({ ...userForm, group_id: e.target.value })
                  }
                  bg="gray.700"
                  border="2px solid"
                  borderColor="gray.500"
                  color="white"
                  _hover={{ borderColor: "cyan.500" }}
                  _focus={{ borderColor: "cyan.400", boxShadow: "0 0 0 2px rgba(0, 181, 216, 0.4)" }}
                >
                  {groups.map((g) => (
                    <option key={g.id} value={g.id} style={{ background: "#2D3748", color: "white" }}>
                      {g.name}
                    </option>
                  ))}
                </Select>
              </FormControl>

              <FormControl display="flex" alignItems="center" justifyContent="space-between" bg="gray.700" p={4} borderRadius="lg">
                <FormLabel color="white" fontSize="sm" fontWeight="bold" mb={0}>
                  Usuário Ativo
                </FormLabel>
                <Switch
                  colorScheme="cyan"
                  isChecked={userForm.is_active}
                  onChange={(e) =>
                    setUserForm({ ...userForm, is_active: e.target.checked })
                  }
                  size="lg"
                />
              </FormControl>
            </VStack>
          </ModalBody>
          <ModalFooter borderTop="2px solid" borderColor="gray.600" bg="gray.700">
            <Button
              variant="outline"
              mr={3}
              onClick={onUserModalClose}
              color="gray.300"
              borderColor="gray.500"
              _hover={{ bg: "gray.600", color: "white" }}
            >
              Cancelar
            </Button>
            <Button
              colorScheme="cyan"
              onClick={saveUser}
              isLoading={savingUser}
              loadingText="Salvando..."
              fontWeight="bold"
            >
              {editingUser ? "Salvar Alterações" : "Criar Usuário"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* ============ Group Modal ============ */}
      <Modal isOpen={isGroupModalOpen} onClose={onGroupModalClose} size="xl" isCentered>
        <ModalOverlay bg="blackAlpha.800" backdropFilter="blur(8px)" />
        <ModalContent bg="gray.800" border="2px solid" borderColor="cyan.600" maxH="85vh">
          <ModalHeader color="white" borderBottom="2px solid" borderColor="gray.600" bg="gray.700" borderTopRadius="md">
            <HStack>
              <Icon as={editingGroup ? FiEdit2 : FiPlus} color="cyan.400" />
              <Text>{editingGroup ? "Editar Grupo" : "Novo Grupo"}</Text>
            </HStack>
          </ModalHeader>
          <ModalCloseButton color="white" _hover={{ bg: "gray.600" }} />
          <ModalBody py={6} overflowY="auto" bg="gray.800">
            <VStack spacing={5}>
              <FormControl isRequired>
                <FormLabel color="cyan.200" fontSize="sm" fontWeight="bold">
                  Nome do Grupo
                </FormLabel>
                <Input
                  value={groupForm.name}
                  onChange={(e) =>
                    setGroupForm({ ...groupForm, name: e.target.value })
                  }
                  isDisabled={editingGroup?.is_system}
                  placeholder="Nome do grupo"
                  bg="gray.700"
                  border="2px solid"
                  borderColor="gray.500"
                  color="white"
                  _placeholder={{ color: "gray.400" }}
                  _hover={{ borderColor: "cyan.500" }}
                  _focus={{ borderColor: "cyan.400", boxShadow: "0 0 0 2px rgba(0, 181, 216, 0.4)" }}
                  _disabled={{ opacity: 0.7, cursor: "not-allowed", bg: "gray.600" }}
                />
              </FormControl>

              <FormControl>
                <FormLabel color="cyan.200" fontSize="sm" fontWeight="bold">
                  Descrição
                </FormLabel>
                <Textarea
                  value={groupForm.description}
                  onChange={(e) =>
                    setGroupForm({ ...groupForm, description: e.target.value })
                  }
                  placeholder="Descrição do grupo (opcional)"
                  bg="gray.700"
                  border="2px solid"
                  borderColor="gray.500"
                  color="white"
                  _placeholder={{ color: "gray.400" }}
                  _hover={{ borderColor: "cyan.500" }}
                  _focus={{ borderColor: "cyan.400", boxShadow: "0 0 0 2px rgba(0, 181, 216, 0.4)" }}
                  rows={2}
                />
              </FormControl>

              <FormControl>
                <FormLabel color="cyan.200" fontSize="sm" fontWeight="bold" mb={4}>
                  Permissões
                </FormLabel>
                <Box
                  bg="gray.700"
                  p={4}
                  borderRadius="lg"
                  border="2px solid"
                  borderColor="gray.500"
                  maxH="300px"
                  overflowY="auto"
                >
                  <CheckboxGroup
                    value={groupForm.permissions}
                    onChange={(vals) =>
                      setGroupForm({
                        ...groupForm,
                        permissions: vals as string[],
                      })
                    }
                  >
                    <VStack align="start" spacing={4}>
                      {permissions.map((cat) => (
                        <Box key={cat.category} w="full">
                          <Text
                            color="cyan.300"
                            fontWeight="bold"
                            fontSize="sm"
                            mb={2}
                            textTransform="uppercase"
                            letterSpacing="wider"
                          >
                            {cat.category}
                          </Text>
                          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={2}>
                            {Object.entries(cat.permissions).map(
                              ([key, label]) => (
                                <Checkbox
                                  key={key}
                                  value={key}
                                  colorScheme="cyan"
                                  borderColor="gray.400"
                                >
                                  <Text color="white" fontSize="sm">
                                    {label}
                                  </Text>
                                </Checkbox>
                              )
                            )}
                          </SimpleGrid>
                          <Divider my={3} borderColor="gray.500" />
                        </Box>
                      ))}
                    </VStack>
                  </CheckboxGroup>
                </Box>
              </FormControl>
            </VStack>
          </ModalBody>
          <ModalFooter borderTop="2px solid" borderColor="gray.600" bg="gray.700">
            <Button
              variant="outline"
              mr={3}
              onClick={onGroupModalClose}
              color="gray.300"
              borderColor="gray.500"
              _hover={{ bg: "gray.600", color: "white" }}
            >
              Cancelar
            </Button>
            <Button
              colorScheme="cyan"
              onClick={saveGroup}
              isLoading={savingGroup}
              loadingText="Salvando..."
              fontWeight="bold"
            >
              {editingGroup ? "Salvar Alterações" : "Criar Grupo"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* ============ Reset Password Modal ============ */}
      <Modal isOpen={isResetModalOpen} onClose={onResetModalClose} isCentered>
        <ModalOverlay bg="blackAlpha.800" backdropFilter="blur(8px)" />
        <ModalContent bg="gray.800" border="2px solid" borderColor="yellow.500">
          <ModalHeader color="white" borderBottom="2px solid" borderColor="gray.600" bg="gray.700" borderTopRadius="md">
            <HStack>
              <Icon as={FiKey} color="yellow.400" />
              <Text>Resetar Senha</Text>
            </HStack>
          </ModalHeader>
          <ModalCloseButton color="white" _hover={{ bg: "gray.600" }} />
          <ModalBody py={6} bg="gray.800">
            <VStack spacing={4}>
              <Box
                w="full"
                p={4}
                bg="yellow.600"
                borderRadius="lg"
                border="2px solid"
                borderColor="yellow.400"
              >
                <Text color="white" fontSize="sm" fontWeight="bold">
                  ⚠️ Você está prestes a resetar a senha do usuário{" "}
                  <Text as="span" color="yellow.100">{resetUser?.username}</Text>
                </Text>
              </Box>
              <FormControl>
                <FormLabel color="cyan.200" fontSize="sm" fontWeight="bold">
                  Nova Senha
                </FormLabel>
                <Input
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  bg="gray.700"
                  border="2px solid"
                  borderColor="gray.500"
                  color="white"
                  _hover={{ borderColor: "cyan.500" }}
                  _focus={{ borderColor: "cyan.400", boxShadow: "0 0 0 2px rgba(0, 181, 216, 0.4)" }}
                />
              </FormControl>
            </VStack>
          </ModalBody>
          <ModalFooter borderTop="2px solid" borderColor="gray.600" bg="gray.700">
            <Button
              variant="outline"
              mr={3}
              onClick={onResetModalClose}
              color="gray.300"
              borderColor="gray.500"
              _hover={{ bg: "gray.600", color: "white" }}
            >
              Cancelar
            </Button>
            <Button
              colorScheme="yellow"
              onClick={resetPassword}
              isLoading={resetting}
              loadingText="Resetando..."
              fontWeight="bold"
            >
              Resetar Senha
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* ============ Delete Confirmation ============ */}
      <AlertDialog
        isOpen={isDeleteOpen}
        leastDestructiveRef={cancelRef}
        onClose={onDeleteClose}
        isCentered
      >
        <AlertDialogOverlay bg="blackAlpha.800" backdropFilter="blur(8px)">
          <AlertDialogContent bg="gray.800" border="2px solid" borderColor="red.500">
            <AlertDialogHeader color="white" borderBottom="2px solid" borderColor="gray.600" bg="gray.700" borderTopRadius="md">
              <HStack>
                <Icon as={FiTrash2} color="red.400" />
                <Text>Confirmar Exclusão</Text>
              </HStack>
            </AlertDialogHeader>

            <AlertDialogBody py={6} bg="gray.800">
              <Box
                w="full"
                p={4}
                bg="red.600"
                borderRadius="lg"
                border="2px solid"
                borderColor="red.400"
                mb={4}
              >
                <Text color="white" fontSize="sm" fontWeight="bold">
                  ⚠️ Esta ação não pode ser desfeita!
                </Text>
              </Box>
              <Text color="gray.100" fontSize="md">
                Tem certeza que deseja remover{" "}
                {deleteTarget?.type === "user" ? "o usuário" : "o grupo"}{" "}
                <Text as="span" color="white" fontWeight="bold">
                  {deleteTarget?.type === "user"
                    ? (deleteTarget?.item as User)?.username
                    : (deleteTarget?.item as Group)?.name}
                </Text>
                ?
              </Text>
            </AlertDialogBody>

            <AlertDialogFooter borderTop="2px solid" borderColor="gray.600" bg="gray.700">
              <Button
                ref={cancelRef}
                onClick={onDeleteClose}
                variant="outline"
                color="gray.300"
                borderColor="gray.500"
                _hover={{ bg: "gray.600", color: "white" }}
              >
                Cancelar
              </Button>
              <Button
                colorScheme="red"
                onClick={executeDelete}
                isLoading={deleting}
                loadingText="Removendo..."
                ml={3}
                fontWeight="bold"
              >
                Sim, Remover
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>
    </Box>
  );
}
