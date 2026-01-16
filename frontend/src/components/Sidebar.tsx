// src/components/Sidebar.tsx
import React from "react";
import {
  Box,
  VStack,
  Text,
  IconButton,
  Tooltip,
  useColorModeValue,
  useDisclosure,
  Drawer,
  DrawerBody,
  DrawerOverlay,
  DrawerContent,
  DrawerCloseButton,
  useBreakpointValue,
  HStack,
  Avatar,
} from "@chakra-ui/react";
import { FiHome, FiTerminal, FiFileText, FiSettings, FiMenu, FiLogOut } from "react-icons/fi";
import { MdDevices } from "react-icons/md";
import { useLocation, useNavigate } from "react-router-dom";

type Item = {
  label: string;
  icon: React.ReactElement;
  to: string;
  aria: string;
};

export const Sidebar: React.FC = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { isOpen, onOpen, onClose } = useDisclosure();

  const bg = useColorModeValue("gray.900", "gray.900");
  const accent = useColorModeValue("teal.300", "teal.300");
  const activeBg = useColorModeValue("gray.800", "gray.800");
  
  const isMobile = useBreakpointValue({ base: true, md: false });

  const items: Item[] = [
    { label: "Dashboard", icon: <FiHome />, to: "/dashboard", aria: "Dashboard" },
    { label: "Dispositivos", icon: <MdDevices />, to: "/dispositivos", aria: "Dispositivos" },
    { label: "Comandos", icon: <FiTerminal />, to: "/logs", aria: "Comandos" },
    { label: "Logs", icon: <FiFileText />, to: "/logs", aria: "Logs" },
    { label: "Configurações", icon: <FiSettings />, to: "/configuracoes", aria: "Configurações" },
  ];

  const handleLogout = () => {
    localStorage.removeItem("token");
    navigate("/login");
  };

  const handleNavigate = (to: string) => {
    navigate(to);
    if (isMobile) onClose();
  };

  const SidebarContent = (
    <Box
      w={isMobile ? "full" : "80px"}
      h="full"
      bg={bg}
      color="white"
      display="flex"
      flexDirection="column"
      alignItems={isMobile ? "stretch" : "center"}
      py={4}
      justifyContent="space-between"
    >
      <Box w="full">
        {/* Logo / Header */}
        <HStack mb={6} px={isMobile ? 4 : 2} justify={isMobile ? "space-between" : "center"}>
          <HStack>
            <Avatar size="sm" bg="teal.500" name="ACS" />
            {isMobile && (
              <Text fontSize="lg" fontWeight="bold" letterSpacing="wide">
                Semppre ACS
              </Text>
            )}
            {!isMobile && (
              <Text fontSize="lg" fontWeight="bold" letterSpacing="wide">
                ACS
              </Text>
            )}
          </HStack>
        </HStack>

        {/* Menu Items */}
        <VStack spacing={2} w="full" px={isMobile ? 2 : 0}>
          {items.map((it) => {
            const isActive = pathname.startsWith(it.to);
            
            if (isMobile) {
              return (
                <Box
                  key={it.label}
                  w="full"
                  p={3}
                  borderRadius="lg"
                  cursor="pointer"
                  bg={isActive ? activeBg : "transparent"}
                  _hover={{ bg: activeBg }}
                  onClick={() => handleNavigate(it.to)}
                  borderLeft={isActive ? `4px solid` : "4px solid transparent"}
                  borderColor={isActive ? accent : "transparent"}
                >
                  <HStack>
                    <Box color={isActive ? accent : "gray.400"}>{it.icon}</Box>
                    <Text fontWeight={isActive ? "semibold" : "normal"} color={isActive ? "white" : "gray.300"}>
                      {it.label}
                    </Text>
                  </HStack>
                </Box>
              );
            }

            return (
              <Tooltip key={it.label} label={it.label} placement="right" hasArrow>
                <IconButton
                  aria-label={it.aria}
                  icon={it.icon}
                  variant="ghost"
                  colorScheme="teal"
                  onClick={() => handleNavigate(it.to)}
                  _hover={{ bg: activeBg }}
                  bg={isActive ? activeBg : "transparent"}
                  position="relative"
                  w="56px"
                  h="56px"
                  borderRadius="xl"
                  _focusVisible={{ boxShadow: "0 0 0 2px rgba(56, 178, 172, 0.7)" }}
                  sx={{
                    "&::before": isActive
                      ? {
                          content: '""',
                          position: "absolute",
                          left: 0,
                          top: "12px",
                          bottom: "12px",
                          width: "4px",
                          borderRadius: "0 4px 4px 0",
                          background: accent,
                        }
                      : {},
                  }}
                />
              </Tooltip>
            );
          })}
        </VStack>
      </Box>

      {/* Footer */}
      <Box w="full" px={isMobile ? 2 : 0}>
        {isMobile ? (
          <Box
            w="full"
            p={3}
            borderRadius="lg"
            cursor="pointer"
            _hover={{ bg: "red.900" }}
            onClick={handleLogout}
          >
            <HStack>
              <Box color="red.400"><FiLogOut /></Box>
              <Text color="red.400">Sair</Text>
            </HStack>
          </Box>
        ) : (
          <VStack spacing={2}>
            <Tooltip label="Sair" placement="right" hasArrow>
              <IconButton
                aria-label="Sair"
                icon={<FiLogOut />}
                variant="ghost"
                colorScheme="red"
                onClick={handleLogout}
                w="56px"
                h="56px"
                borderRadius="xl"
              />
            </Tooltip>
          </VStack>
        )}
        <Box px={2} textAlign="center" opacity={0.7} mt={4}>
          <Text fontSize="xs" color="gray.500">
            © 2025 Marcos Vinicius
          </Text>
        </Box>
      </Box>
    </Box>
  );

  // Mobile: mostrar botão hamburguer flutuante
  if (isMobile) {
    return (
      <>
        {/* Botão flutuante para abrir menu */}
        <IconButton
          aria-label="Menu"
          icon={<FiMenu />}
          position="fixed"
          top={4}
          left={4}
          zIndex={20}
          colorScheme="teal"
          onClick={onOpen}
          size="lg"
          borderRadius="full"
          boxShadow="lg"
        />

        {/* Drawer menu mobile */}
        <Drawer isOpen={isOpen} placement="left" onClose={onClose}>
          <DrawerOverlay />
          <DrawerContent bg="gray.900" maxW="280px">
            <DrawerCloseButton color="white" />
            <DrawerBody p={0}>{SidebarContent}</DrawerBody>
          </DrawerContent>
        </Drawer>
      </>
    );
  }

  // Desktop: sidebar fixa
  return (
    <Box
      as="aside"
      position="fixed"
      left={0}
      top={0}
      h="100vh"
      borderRight="1px solid"
      borderColor="gray.800"
      zIndex={10}
    >
      {SidebarContent}
    </Box>
  );
};
