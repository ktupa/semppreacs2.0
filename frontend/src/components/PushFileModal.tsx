// src/components/PushFileModal.tsx
import {
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalFooter, ModalBody, ModalCloseButton,
  Button, FormControl, FormLabel, Select, Input, useToast, VStack, Text, HStack, Badge, Progress,
} from "@chakra-ui/react";
import { useEffect, useMemo, useState } from "react";
import { getFiles, uploadFile, createTask, FileEntry } from "../services/genieAcsApi";

interface PushFileModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedDeviceId: string | null;
}

const FILE_TYPES = [
  "1 Firmware Upgrade Image",
  "2 Web Content",
  "3 Vendor Configuration File",
  "4 Tone File",
  "5 Ringer File",
];

export default function PushFileModal({
  isOpen,
  onClose,
  selectedDeviceId,
}: PushFileModalProps) {
  const toast = useToast();
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [selectedFile, setSelectedFile] = useState<string>("");
  const [uploadingFile, setUploadingFile] = useState<File | null>(null);
  const [fileType, setFileType] = useState(FILE_TYPES[0]);
  const [version, setVersion] = useState("");
  const [oui, setOUI] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number>(0);

  const selectedMeta = useMemo(
    () => files.find((f) => (f.filename || f.name) === selectedFile),
    [files, selectedFile]
  );

  useEffect(() => {
    if (!isOpen) return;
    (async () => {
      try {
        const list = await getFiles();
        setFiles(list || []);
      } catch {
        setFiles([]);
        toast({ title: "Erro ao buscar arquivos", status: "error" });
      }
    })();
  }, [isOpen, toast]);

  const handleUpload = async () => {
    if (!uploadingFile) {
      toast({ title: "Selecione um arquivo para enviar", status: "warning" });
      return;
    }
    // validação básica
    if (uploadingFile.size > 1024 * 1024 * 512) {
      toast({ title: "Arquivo acima de 512 MB", status: "error" });
      return;
    }

    try {
      setBusy(true);
      setProgress(10);
      await uploadFile(uploadingFile.name, uploadingFile, {
        fileType,
        version,
        oui,
        // backend pode ignorar meta não reconhecida; ok
      });
      setProgress(90);

      const atualizados = await getFiles();
      setFiles(atualizados || []);
      setSelectedFile(uploadingFile.name);
      setProgress(100);
      toast({ title: "Arquivo enviado com sucesso", status: "success" });
    } catch (e: any) {
      toast({
        title: "Erro ao fazer upload",
        description: e?.response?.data?.detail || e?.message || "Falha desconhecida",
        status: "error",
      });
    } finally {
      setBusy(false);
      setTimeout(() => setProgress(0), 600);
    }
  };

  const handleSubmit = async () => {
    if (!selectedDeviceId) {
      toast({ title: "Dispositivo inválido", status: "error" });
      return;
    }
    if (!selectedFile) {
      toast({ title: "Selecione um arquivo existente ou envie um novo", status: "warning" });
      return;
    }

    try {
      setBusy(true);
      await createTask(selectedDeviceId, { name: "download", file: selectedFile }, true);
      toast({ title: `Push File enviado: ${selectedFile}`, status: "success" });
      onClose();
    } catch (e: any) {
      toast({
        title: "Erro ao enviar push file",
        description: e?.response?.data?.detail || e?.message || "Falha desconhecida",
        status: "error",
      });
    } finally {
      setBusy(false);
    }
  };

  const resetState = () => {
    setSelectedFile("");
    setUploadingFile(null);
    setVersion("");
    setOUI("");
    setFileType(FILE_TYPES[0]);
    setProgress(0);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (!busy) {
          resetState();
          onClose();
        }
      }}
      size="lg"
      isCentered
    >
      <ModalOverlay />
      <ModalContent bg="gray.800" color="white" border="1px solid" borderColor="gray.700">
        <ModalHeader>Enviar Arquivo para Dispositivo</ModalHeader>
        <ModalCloseButton disabled={busy} />
        <ModalBody>
          <VStack spacing={4} align="stretch">
            <FormControl>
              <FormLabel>Selecionar Arquivo Existente</FormLabel>
              <Select
                placeholder="Escolha um arquivo"
                value={selectedFile}
                onChange={(e) => setSelectedFile(e.target.value)}
                disabled={busy}
              >
                {files.map((f) => (
                  <option key={f._id} value={f.filename}>
                    {f.filename}
                  </option>
                ))}
              </Select>
              {selectedMeta && (
                <HStack mt={2} spacing={3}>
                  {selectedMeta.fileType && <Badge colorScheme="purple">{selectedMeta.fileType}</Badge>}
                  {selectedMeta.version && <Badge colorScheme="blue">v{selectedMeta.version}</Badge>}
                  {selectedMeta.oui && <Badge colorScheme="cyan">{selectedMeta.oui}</Badge>}
                </HStack>
              )}
            </FormControl>

            <Text mt={2} fontWeight="bold" color="gray.200">
              Ou envie novo arquivo
            </Text>

            <FormControl>
              <FormLabel>Arquivo</FormLabel>
              <Input
                type="file"
                accept="*"
                onChange={(e) => setUploadingFile(e.target.files?.[0] || null)}
                disabled={busy}
              />
            </FormControl>

            <HStack spacing={4}>
              <FormControl>
                <FormLabel>Tipo</FormLabel>
                <Select value={fileType} onChange={(e) => setFileType(e.target.value)} disabled={busy}>
                  {FILE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
              </FormControl>

              <FormControl>
                <FormLabel>OUI</FormLabel>
                <Input value={oui} onChange={(e) => setOUI(e.target.value)} disabled={busy} />
              </FormControl>

              <FormControl>
                <FormLabel>Versão</FormLabel>
                <Input value={version} onChange={(e) => setVersion(e.target.value)} disabled={busy} />
              </FormControl>
            </HStack>

            {busy && (
              <Progress value={progress} size="sm" colorScheme="blue" borderRadius="md" />
            )}

            <Button colorScheme="green" onClick={handleUpload} isDisabled={!uploadingFile || busy}>
              Enviar Arquivo
            </Button>
          </VStack>
        </ModalBody>
        <ModalFooter>
          <HStack spacing={3}>
            <Button colorScheme="blue" onClick={handleSubmit} isDisabled={!selectedFile || busy}>
              Push File
            </Button>
            <Button variant="ghost" onClick={() => !busy && onClose()} disabled={busy}>
              Cancelar
            </Button>
          </HStack>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
