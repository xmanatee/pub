import { useCallback, useEffect, useRef, useState } from "react";
import type { ReceivedFile } from "~/features/live-chat/types/live-chat-types";

interface AddReceivedBinaryFileParams {
  binaryData: ArrayBuffer;
  filename?: string;
  id: string;
  mime?: string;
}

export function useLiveFiles() {
  const [files, setFiles] = useState<ReceivedFile[]>([]);
  const fileUrlsRef = useRef<string[]>([]);

  useEffect(() => {
    return () => {
      for (const url of fileUrlsRef.current) URL.revokeObjectURL(url);
      fileUrlsRef.current = [];
    };
  }, []);

  const addReceivedBinaryFile = useCallback(
    ({ binaryData, filename, id, mime }: AddReceivedBinaryFileParams) => {
      const resolvedMime = mime || "application/octet-stream";
      const resolvedFilename = filename || "download.bin";
      const blob = new Blob([binaryData], { type: resolvedMime });
      const downloadUrl = URL.createObjectURL(blob);
      fileUrlsRef.current.push(downloadUrl);

      setFiles((prev) => [
        ...prev,
        {
          id,
          filename: resolvedFilename,
          mime: resolvedMime,
          size: binaryData.byteLength,
          downloadUrl,
          timestamp: Date.now(),
        },
      ]);
    },
    [],
  );

  const clearFiles = useCallback(() => {
    for (const url of fileUrlsRef.current) URL.revokeObjectURL(url);
    fileUrlsRef.current = [];
    setFiles([]);
  }, []);

  return {
    addReceivedBinaryFile,
    clearFiles,
    files,
  };
}
