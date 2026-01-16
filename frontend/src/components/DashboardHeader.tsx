// src/components/DashboardHeader.tsx
import { Flex, Text, Button, Icon, HStack, useColorModeValue } from "@chakra-ui/react";
import { motion } from "framer-motion";
import { Plus, RefreshCcw } from "lucide-react";
import React from "react";

const MotionFlex = motion(Flex);

interface DashboardHeaderProps {
  title?: string;
  subtitle?: string;
  onNewCommand?: () => void;
  onRefresh?: () => void;
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  title = "Painel de Controle",
  subtitle,
  onNewCommand,
  onRefresh,
}) => {
  const textColor = useColorModeValue("white", "whiteAlpha.900");
  const subColor = useColorModeValue("gray.400", "gray.500");

  return (
    <MotionFlex
      justifyContent="space-between"
      alignItems={{ base: "start", md: "center" }}
      flexDirection={{ base: "column", md: "row" }}
      mb={6}
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Flex flexDir="column">
        <Text fontSize={{ base: "2xl", md: "3xl" }} fontWeight="bold" color={textColor}>
          {title}
        </Text>
        {subtitle && (
          <Text fontSize="sm" color={subColor}>
            {subtitle}
          </Text>
        )}
      </Flex>

      <HStack spacing={3} mt={{ base: 3, md: 0 }}>
        {onRefresh && (
          <Button
            variant="outline"
            size="sm"
            colorScheme="cyan"
            leftIcon={<Icon as={RefreshCcw} boxSize={4} />}
            onClick={onRefresh}
          >
            Atualizar
          </Button>
        )}

        {onNewCommand && (
          <Button
            colorScheme="cyan"
            size="sm"
            leftIcon={<Icon as={Plus} boxSize={4} />}
            onClick={onNewCommand}
          >
            Novo Comando
          </Button>
        )}
      </HStack>
    </MotionFlex>
  );
};
