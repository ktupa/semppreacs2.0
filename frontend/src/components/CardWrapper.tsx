// src/components/CardWrapper.tsx
import { Box, useColorModeValue } from "@chakra-ui/react";
import { motion } from "framer-motion";

const MotionBox = motion(Box);

interface CardWrapperProps {
  children: React.ReactNode;
  minH?: string;
  p?: number | string;
  hoverable?: boolean;
}

export default function CardWrapper({
  children,
  minH,
  p = 6,
  hoverable = true,
}: CardWrapperProps) {
  const bg = useColorModeValue("#1A202C", "gray.800");
  const shadow = useColorModeValue("md", "lg");

  return (
    <MotionBox
      bg={bg}
      p={p}
      borderRadius="xl"
      boxShadow={shadow}
      minH={minH}
      whileHover={hoverable ? { scale: 1.02, transition: { duration: 0.2 } } : {}}
      whileTap={hoverable ? { scale: 0.98 } : {}}
      transition="all 0.2s ease-in-out"
      border="1px solid"
      borderColor={useColorModeValue("gray.700", "gray.700")}
    >
      {children}
    </MotionBox>
  );
}
