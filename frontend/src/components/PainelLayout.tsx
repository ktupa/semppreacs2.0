// src/components/PainelLayout.tsx
import { Box, Flex, useBreakpointValue } from "@chakra-ui/react";
import { Sidebar } from "./Sidebar";
import { DashboardHeader } from "./DashboardHeader";

interface PainelLayoutProps {
  children: React.ReactNode;
  title?: string;
  onNewCommand?: () => void;
}

export function PainelLayout({
  children,
  title = "Dashboard",
  onNewCommand = () => console.log("Botão Novo Comando clicado!"),
}: PainelLayoutProps) {
  const isMobile = useBreakpointValue({ base: true, md: false });
  const sidebarWidth = isMobile ? 0 : 80;

  return (
    <Flex w="100vw" minH="100vh" bg="gray.900">
      {/* Sidebar - fixo em desktop, drawer em mobile */}
      <Sidebar />
      
      {/* Conteúdo principal */}
      <Box
        flex="1"
        ml={{ base: 0, md: `${sidebarWidth}px` }}
        p={{ base: 4, md: 6, lg: 8 }}
        pt={{ base: 16, md: 6 }}
        overflowY="auto"
        bgGradient="linear(to-b, gray.900, gray.800)"
        transition="all 0.2s ease"
        minH="100vh"
      >
        <DashboardHeader title={title} onNewCommand={onNewCommand} />
        <Box mt={4}>{children}</Box>
      </Box>
    </Flex>
  );
}
