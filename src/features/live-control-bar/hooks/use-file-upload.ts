import { type ChangeEvent, useCallback, useRef } from "react";
import {
  CHANNELS,
  makeBinaryMetaMessage,
  makeHtmlMessage,
} from "~/features/live/lib/bridge-protocol";
import type { BrowserBridge } from "~/features/live/lib/webrtc-browser";
import { ensureChannelReady } from "~/features/live/lib/webrtc-channel";

interface UseFileUploadOptions {
  bridge: BrowserBridge | null;
  onSendFile?: (file: File) => void;
}

export function useFileUpload({ bridge, onSendFile }: UseFileUploadOptions) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (onSendFile) {
        onSendFile(file);
        e.target.value = "";
        return;
      }
      if (!bridge) return;

      const isHtml = file.name.endsWith(".html") || file.name.endsWith(".htm");
      if (isHtml) {
        const text = await file.text();
        const ready = await ensureChannelReady(bridge, CHANNELS.CANVAS);
        if (!ready) return;
        bridge.send(CHANNELS.CANVAS, makeHtmlMessage(text, file.name));
      } else {
        const binary = await file.arrayBuffer();
        const ready = await ensureChannelReady(bridge, CHANNELS.FILE);
        if (!ready) return;
        bridge.send(
          CHANNELS.FILE,
          makeBinaryMetaMessage({
            filename: file.name,
            mime: file.type || "application/octet-stream",
            size: binary.byteLength,
          }),
        );
        bridge.sendBinary(CHANNELS.FILE, binary);
      }

      e.target.value = "";
    },
    [bridge, onSendFile],
  );

  return { fileInputRef, handleFile };
}
