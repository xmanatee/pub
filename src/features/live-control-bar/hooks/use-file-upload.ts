import { type ChangeEvent, useCallback, useRef } from "react";

interface UseFileUploadOptions {
  onSendFile: (file: File) => void;
}

export function useFileUpload({ onSendFile }: UseFileUploadOptions) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      onSendFile(file);
      e.target.value = "";
    },
    [onSendFile],
  );

  return { fileInputRef, handleFile };
}
