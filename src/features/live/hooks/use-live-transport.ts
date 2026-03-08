import { useCallback, useEffect, useRef, useState } from "react";
import { useLiveBridge } from "~/features/live/hooks/use-live-bridge";
import {
  CHANNELS,
  generateMessageId,
  makeEventMessage,
  makeHtmlMessage,
  makeStreamEnd,
  makeStreamStart,
  makeTextMessage,
} from "~/features/live/lib/bridge-protocol";
import {
  parseCommandBindResultMessage,
  parseCommandResultMessage,
} from "~/features/live/lib/command-protocol";
import type { ChannelMessage } from "~/features/live/lib/webrtc-browser";
import { ensureChannelReady } from "~/features/live/lib/webrtc-channel";
import type {
  CanvasBridgeInboundMessage,
  CanvasBridgeOutboundMessage,
  LiveRenderErrorPayload,
  LiveViewMode,
} from "~/features/live/types/live-types";
import { analyzeAudioBlob } from "~/features/live/utils/audio-waveform";

const CHAT_ACK_TIMEOUT_MS = 8_000;
const RENDER_ERROR_ACK_TIMEOUT_MS = 4_000;
const STREAM_ACK_TIMEOUT_MS = 10_000;
const STREAM_CHUNK_SIZE = 48 * 1024;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const COMMAND_ACK_TIMEOUT_MS = 4_000;

interface UseLiveTransportOptions {
  slug: string;
  enabled: boolean;
  connectionAttempt: number;
  agentAnswer: string | undefined;
  agentCandidates: string[] | undefined;
  autoOpenCanvas: boolean;
  storeBrowserOffer: (input: { slug: string; offer: string }) => Promise<unknown>;
  storeBrowserCandidates: (input: { slug: string; candidates: string[] }) => Promise<unknown>;
  addAgentAudioMessage: (params: {
    audioUrl: string;
    id: string;
    mime: string;
    size: number;
  }) => void;
  addAgentImageMessage: (params: {
    height?: number;
    id: string;
    imageUrl: string;
    mime: string;
    width?: number;
  }) => void;
  addAgentMessage: (params: { content: string; id: string; timestamp?: number }) => void;
  addReceivedBinaryFile: (params: {
    binaryData: ArrayBuffer;
    filename?: string;
    id: string;
    mime?: string;
  }) => void;
  addUserPendingAudioMessage: (params: {
    audioUrl: string;
    id: string;
    mime: string;
    size: number;
  }) => void;
  addUserPendingAttachmentMessage: (params: {
    fileUrl?: string;
    filename: string;
    id: string;
    mime: string;
    size: number;
  }) => void;
  addUserPendingImageMessage: (params: {
    height?: number;
    id: string;
    imageUrl: string;
    mime: string;
    size: number;
    width?: number;
  }) => void;
  addUserPendingMessage: (params: { content: string; id: string; timestamp?: number }) => void;
  addSystemMessage: (params: {
    content: string;
    cooldownMs?: number;
    dedupeKey?: string;
    severity: "warning" | "error";
  }) => void;
  failSentMessages: () => void;
  markMessageConfirmed: (messageId: string) => void;
  markMessageFailed: (messageId: string) => void;
  markMessageFailedIfPending: (messageId: string) => void;
  markMessageReceived: (messageId: string) => void;
  markMessageSentIfPending: (messageId: string) => void;
  updateAudioMessageAnalysis: (messageId: string, duration: number, waveform: number[]) => void;
}

export function useLiveTransport({
  slug,
  enabled,
  connectionAttempt,
  agentAnswer,
  agentCandidates,
  autoOpenCanvas,
  storeBrowserOffer,
  storeBrowserCandidates,
  addAgentAudioMessage,
  addAgentImageMessage,
  addAgentMessage,
  addReceivedBinaryFile,
  addUserPendingAttachmentMessage,
  addUserPendingAudioMessage,
  addUserPendingImageMessage,
  addUserPendingMessage,
  addSystemMessage,
  failSentMessages,
  markMessageConfirmed,
  markMessageFailed,
  markMessageFailedIfPending,
  markMessageReceived,
  markMessageSentIfPending,
  updateAudioMessageAnalysis,
}: UseLiveTransportOptions) {
  const [canvasHtml, setCanvasHtml] = useState<string | null>(null);
  const [outboundCanvasBridgeMessage, setOutboundCanvasBridgeMessage] =
    useState<CanvasBridgeOutboundMessage | null>(null);
  const [viewMode, setViewMode] = useState<LiveViewMode>("canvas");
  const [lastAgentActivityAt, setLastAgentActivityAt] = useState<number | null>(null);
  const [lastUserDeliveredAt, setLastUserDeliveredAt] = useState<number | null>(null);

  const pendingChatQueueRef = useRef<Array<{ msg: ReturnType<typeof makeTextMessage> }>>([]);
  const pendingAudioQueueRef = useRef<Array<{ blob: Blob; id: string }>>([]);
  const pendingFileQueueRef = useRef<
    Array<{
      channel: "file" | "media";
      file: File;
      id: string;
    }>
  >([]);
  const lastResetSlugRef = useRef<string | null>(null);
  const commandProcessingQueueRef = useRef<Promise<void>>(Promise.resolve());

  const markAgentActivity = useCallback(() => {
    setLastAgentActivityAt(Date.now());
  }, []);

  const emitSystemMessage = useCallback(
    (params: { content: string; dedupeKey?: string; severity: "warning" | "error" }) => {
      addSystemMessage({ ...params, cooldownMs: 4_000 });
    },
    [addSystemMessage],
  );

  useEffect(() => {
    if (lastResetSlugRef.current === slug) return;
    lastResetSlugRef.current = slug;

    setCanvasHtml(null);
    setOutboundCanvasBridgeMessage(null);
    setViewMode("canvas");
    setLastAgentActivityAt(null);
    setLastUserDeliveredAt(null);
    pendingChatQueueRef.current = [];
    pendingAudioQueueRef.current = [];
    pendingFileQueueRef.current = [];
  }, [slug]);

  const handleBridgeMessage = useCallback(
    (cm: ChannelMessage) => {
      const { channel, message } = cm;

      if (channel === CHANNELS.CHAT && message.type === "text" && message.data) {
        markAgentActivity();
        addAgentMessage({ id: message.id, content: message.data });
        return;
      }

      if (channel === CHANNELS.CANVAS) {
        markAgentActivity();
        if (message.type === "html" && message.data) {
          setCanvasHtml(message.data);
          if (autoOpenCanvas) setViewMode("canvas");
          return;
        }
        if (message.type === "event" && message.data === "hide") {
          setCanvasHtml(null);
        }
        return;
      }

      if (channel === CHANNELS.FILE && message.type === "binary" && cm.binaryData) {
        markAgentActivity();
        addReceivedBinaryFile({
          binaryData: cm.binaryData,
          filename: typeof message.meta?.filename === "string" ? message.meta.filename : undefined,
          id: message.id,
          mime: typeof message.meta?.mime === "string" ? message.meta.mime : undefined,
        });
        return;
      }

      if (channel === CHANNELS.AUDIO && message.type === "binary" && cm.binaryData) {
        markAgentActivity();
        const mime = typeof message.meta?.mime === "string" ? message.meta.mime : "audio/webm";
        const blob = new Blob([cm.binaryData], { type: mime });
        const audioUrl = URL.createObjectURL(blob);
        const audioId = message.id;
        addAgentAudioMessage({ audioUrl, id: audioId, mime, size: cm.binaryData.byteLength });
        analyzeAudioBlob(blob).then(
          ({ duration, peaks }) => updateAudioMessageAnalysis(audioId, duration, peaks),
          (err) => console.warn("Audio analysis failed:", err),
        );
        return;
      }

      if (channel === CHANNELS.MEDIA && message.type === "binary" && cm.binaryData) {
        markAgentActivity();
        const mime = typeof message.meta?.mime === "string" ? message.meta.mime : "image/png";
        const blob = new Blob([cm.binaryData], { type: mime });
        const imageUrl = URL.createObjectURL(blob);
        addAgentImageMessage({
          id: message.id,
          imageUrl,
          mime,
          width: typeof message.meta?.width === "number" ? message.meta.width : undefined,
          height: typeof message.meta?.height === "number" ? message.meta.height : undefined,
        });
        return;
      }

      if (channel === CHANNELS.COMMAND) {
        commandProcessingQueueRef.current = commandProcessingQueueRef.current.then(() => {
          const bindResult = parseCommandBindResultMessage(message);
          if (bindResult) {
            setOutboundCanvasBridgeMessage({
              id: generateMessageId(),
              type: "command.bind.result",
              payload: bindResult,
            });
            return;
          }
          const result = parseCommandResultMessage(message);
          if (result) {
            setOutboundCanvasBridgeMessage({
              id: generateMessageId(),
              type: "command.result",
              payload: result,
            });
          }
        });
      }
    },
    [
      addAgentAudioMessage,
      addAgentImageMessage,
      addAgentMessage,
      addReceivedBinaryFile,
      autoOpenCanvas,
      markAgentActivity,
      updateAudioMessageAnalysis,
    ],
  );

  const handleDeliveryReceipt = useCallback(
    (receipt: {
      channel: string;
      messageId: string;
      stage: "received" | "confirmed" | "failed";
    }) => {
      if (
        receipt.channel !== CHANNELS.CHAT &&
        receipt.channel !== CHANNELS.AUDIO &&
        receipt.channel !== CHANNELS.MEDIA &&
        receipt.channel !== CHANNELS.FILE
      ) {
        return;
      }
      if (receipt.stage === "received") {
        setLastUserDeliveredAt(Date.now());
        markMessageReceived(receipt.messageId);
        return;
      }
      if (receipt.stage === "confirmed") {
        markMessageConfirmed(receipt.messageId);
        return;
      }
      markMessageFailed(receipt.messageId);
    },
    [markMessageConfirmed, markMessageFailed, markMessageReceived],
  );

  const { bridgeRef, bridgeState } = useLiveBridge({
    slug,
    enabled,
    connectionAttempt,
    agentAnswer,
    agentCandidates,
    storeBrowserOffer,
    storeBrowserCandidates,
    onDeliveryReceipt: handleDeliveryReceipt,
    onMessage: handleBridgeMessage,
    onSystemMessage: emitSystemMessage,
    onTrackActivity: markAgentActivity,
  });

  const dispatchChatMessage = useCallback(
    (msg: ReturnType<typeof makeTextMessage>) => {
      void (async () => {
        const bridge = bridgeRef.current;
        if (!bridge) {
          markMessageFailedIfPending(msg.id);
          emitSystemMessage({
            content: "Message failed to send because the live bridge is unavailable.",
            dedupeKey: "chat-send-no-bridge",
            severity: "error",
          });
          return;
        }
        const ready = await ensureChannelReady(bridge, CHANNELS.CHAT);
        if (!ready) {
          markMessageFailedIfPending(msg.id);
          emitSystemMessage({
            content: "Message failed to send because the chat channel is not ready.",
            dedupeKey: "chat-channel-not-ready",
            severity: "error",
          });
          return;
        }

        const delivered = await bridge.sendWithAck(CHANNELS.CHAT, msg, CHAT_ACK_TIMEOUT_MS);
        if (delivered) {
          markMessageSentIfPending(msg.id);
          return;
        }

        markMessageFailedIfPending(msg.id);
        emitSystemMessage({
          content: "Message delivery timed out. Please retry.",
          dedupeKey: "chat-send-timeout",
          severity: "error",
        });
      })();
    },
    [bridgeRef, emitSystemMessage, markMessageFailedIfPending, markMessageSentIfPending],
  );

  const sendChat = useCallback(
    (text: string) => {
      const msg = makeTextMessage(text);
      addUserPendingMessage({ id: msg.id, content: text });
      if (bridgeState !== "connected") {
        pendingChatQueueRef.current.push({ msg });
        return;
      }
      dispatchChatMessage(msg);
    },
    [addUserPendingMessage, bridgeState, dispatchChatMessage],
  );

  const sendRenderError = useCallback(
    (payload: LiveRenderErrorPayload) => {
      if (bridgeState !== "connected") return;
      const bridge = bridgeRef.current;
      if (!bridge) return;

      const normalizedMessage = payload.message.trim();
      if (normalizedMessage.length === 0) return;
      const location =
        typeof payload.lineno === "number" && payload.lineno > 0
          ? `${payload.lineno}${typeof payload.colno === "number" && payload.colno > 0 ? `:${payload.colno}` : ""}`
          : undefined;

      const detailLines = [
        `message: ${normalizedMessage.slice(0, 2_000)}`,
        typeof payload.filename === "string" && payload.filename.length > 0
          ? `filename: ${payload.filename}`
          : null,
        location ? `location: ${location}` : null,
      ].filter((line): line is string => line !== null);

      const msg = makeTextMessage(detailLines.join("\n"));
      void (async () => {
        const ready = await ensureChannelReady(bridge, CHANNELS.RENDER_ERROR);
        if (!ready) return;
        await bridge.sendWithAck(CHANNELS.RENDER_ERROR, msg, RENDER_ERROR_ACK_TIMEOUT_MS);
      })();
    },
    [bridgeRef, bridgeState],
  );

  const dispatchAudio = useCallback(
    (blob: Blob, id: string) => {
      const bridge = bridgeRef.current;
      if (!bridge) {
        markMessageFailedIfPending(id);
        emitSystemMessage({
          content: "Audio failed to send because the live bridge is unavailable.",
          dedupeKey: "audio-send-no-bridge",
          severity: "error",
        });
        return;
      }
      void (async () => {
        const ready = await ensureChannelReady(bridge, CHANNELS.AUDIO);
        if (!ready) {
          markMessageFailedIfPending(id);
          emitSystemMessage({
            content: "Audio failed to send because the audio channel is not ready.",
            dedupeKey: "audio-channel-not-ready",
            severity: "error",
          });
          return;
        }
        const buffer = await blob.arrayBuffer();
        const startMsg = makeStreamStart({ mime: blob.type, size: buffer.byteLength }, id);
        if (!bridge.send(CHANNELS.AUDIO, startMsg)) {
          markMessageFailedIfPending(id);
          emitSystemMessage({
            content: "Audio stream failed to start. Please retry.",
            dedupeKey: "audio-stream-start-failed",
            severity: "error",
          });
          return;
        }

        const bytes = new Uint8Array(buffer);
        for (let offset = 0; offset < bytes.length; offset += STREAM_CHUNK_SIZE) {
          const chunk = bytes.slice(offset, offset + STREAM_CHUNK_SIZE);
          if (!bridge.sendBinary(CHANNELS.AUDIO, chunk.buffer)) {
            markMessageFailedIfPending(id);
            emitSystemMessage({
              content: "Audio upload was interrupted while streaming.",
              dedupeKey: "audio-stream-chunk-failed",
              severity: "error",
            });
            return;
          }
        }

        const ended = await bridge.sendWithAck(
          CHANNELS.AUDIO,
          makeStreamEnd(startMsg.id),
          STREAM_ACK_TIMEOUT_MS,
        );
        if (!ended) {
          markMessageFailedIfPending(id);
          emitSystemMessage({
            content: "Audio upload did not complete in time.",
            dedupeKey: "audio-stream-end-timeout",
            severity: "error",
          });
          return;
        }

        markMessageSentIfPending(id);
      })();
    },
    [bridgeRef, emitSystemMessage, markMessageFailedIfPending, markMessageSentIfPending],
  );

  const sendAudio = useCallback(
    (blob: Blob) => {
      const audioUrl = URL.createObjectURL(blob);
      const id = generateMessageId();
      addUserPendingAudioMessage({
        audioUrl,
        id,
        mime: blob.type || "audio/webm",
        size: blob.size,
      });
      analyzeAudioBlob(blob).then(
        ({ duration, peaks }) => updateAudioMessageAnalysis(id, duration, peaks),
        (err) => console.warn("Audio analysis failed:", err),
      );
      if (bridgeState !== "connected") {
        pendingAudioQueueRef.current.push({ blob, id });
        return;
      }
      dispatchAudio(blob, id);
    },
    [addUserPendingAudioMessage, bridgeState, dispatchAudio, updateAudioMessageAnalysis],
  );

  const dispatchFile = useCallback(
    (file: File, id: string, channel: "file" | "media") => {
      const bridge = bridgeRef.current;
      if (!bridge) {
        markMessageFailedIfPending(id);
        emitSystemMessage({
          content: "File failed to send because the live bridge is unavailable.",
          dedupeKey: "file-send-no-bridge",
          severity: "error",
        });
        return;
      }

      void (async () => {
        const ready = await ensureChannelReady(bridge, channel);
        if (!ready) {
          markMessageFailedIfPending(id);
          emitSystemMessage({
            content: "File failed to send because its data channel is not ready.",
            dedupeKey: "file-channel-not-ready",
            severity: "error",
          });
          return;
        }
        const buffer = await file.arrayBuffer();
        const startMsg = makeStreamStart(
          {
            filename: file.name,
            mime: file.type || "application/octet-stream",
            size: buffer.byteLength,
          },
          id,
        );
        if (!bridge.send(channel, startMsg)) {
          markMessageFailedIfPending(id);
          emitSystemMessage({
            content: "File stream failed to start. Please retry.",
            dedupeKey: "file-stream-start-failed",
            severity: "error",
          });
          return;
        }

        const bytes = new Uint8Array(buffer);
        for (let offset = 0; offset < bytes.length; offset += STREAM_CHUNK_SIZE) {
          const chunk = bytes.slice(offset, offset + STREAM_CHUNK_SIZE);
          if (!bridge.sendBinary(channel, chunk.buffer)) {
            markMessageFailedIfPending(id);
            emitSystemMessage({
              content: "File upload was interrupted while streaming.",
              dedupeKey: "file-stream-chunk-failed",
              severity: "error",
            });
            return;
          }
        }

        const ended = await bridge.sendWithAck(
          channel,
          makeStreamEnd(startMsg.id),
          STREAM_ACK_TIMEOUT_MS,
        );
        if (!ended) {
          markMessageFailedIfPending(id);
          emitSystemMessage({
            content: "File upload did not complete in time.",
            dedupeKey: "file-stream-end-timeout",
            severity: "error",
          });
          return;
        }

        markMessageSentIfPending(id);
      })();
    },
    [bridgeRef, emitSystemMessage, markMessageFailedIfPending, markMessageSentIfPending],
  );

  const sendFile = useCallback(
    (file: File) => {
      if (file.size > MAX_FILE_SIZE) {
        emitSystemMessage({
          content: `File "${file.name}" is too large. Max size is 10 MB.`,
          dedupeKey: "file-too-large",
          severity: "warning",
        });
        return;
      }

      const isHtml = file.name.endsWith(".html") || file.name.endsWith(".htm");
      if (isHtml) {
        const bridge = bridgeRef.current;
        if (!bridge) {
          emitSystemMessage({
            content: "HTML update failed because live connection is not ready.",
            dedupeKey: "html-send-no-bridge",
            severity: "warning",
          });
          return;
        }
        void (async () => {
          const text = await file.text();
          const ready = await ensureChannelReady(bridge, CHANNELS.CANVAS);
          if (!ready) {
            emitSystemMessage({
              content: "HTML update failed because the canvas channel is not ready.",
              dedupeKey: "html-channel-not-ready",
              severity: "warning",
            });
            return;
          }
          if (!bridge.send(CHANNELS.CANVAS, makeHtmlMessage(text, file.name))) {
            emitSystemMessage({
              content: "HTML update failed to send to canvas.",
              dedupeKey: "html-send-failed",
              severity: "error",
            });
          }
        })();
        return;
      }

      const id = generateMessageId();
      const mime = file.type || "application/octet-stream";
      const isImage = mime.startsWith("image/");
      const fileUrl = URL.createObjectURL(file);
      if (isImage) {
        addUserPendingImageMessage({
          id,
          imageUrl: fileUrl,
          mime,
          size: file.size,
        });
      } else {
        addUserPendingAttachmentMessage({
          id,
          filename: file.name,
          mime,
          size: file.size,
          fileUrl,
        });
      }

      const channel = isImage ? CHANNELS.MEDIA : CHANNELS.FILE;
      if (bridgeState !== "connected") {
        pendingFileQueueRef.current.push({ channel, file, id });
        return;
      }
      dispatchFile(file, id, channel);
    },
    [
      addUserPendingAttachmentMessage,
      addUserPendingImageMessage,
      bridgeRef,
      bridgeState,
      dispatchFile,
      emitSystemMessage,
    ],
  );

  useEffect(() => {
    if (bridgeState !== "connected") return;

    const chatQueue = pendingChatQueueRef.current.splice(0);
    for (const { msg } of chatQueue) {
      dispatchChatMessage(msg);
    }

    const audioQueue = pendingAudioQueueRef.current.splice(0);
    for (const entry of audioQueue) {
      dispatchAudio(entry.blob, entry.id);
    }

    const fileQueue = pendingFileQueueRef.current.splice(0);
    for (const entry of fileQueue) {
      dispatchFile(entry.file, entry.id, entry.channel);
    }
  }, [bridgeState, dispatchAudio, dispatchChatMessage, dispatchFile]);

  useEffect(() => {
    if (bridgeState === "disconnected") {
      failSentMessages();
      emitSystemMessage({
        content: "Live connection dropped. Pending messages may have failed.",
        dedupeKey: "bridge-disconnected",
        severity: "warning",
      });
    }
  }, [bridgeState, emitSystemMessage, failSentMessages]);

  const clearCanvas = useCallback(() => {
    setCanvasHtml(null);
  }, []);

  const emitCommandFailureToCanvas = useCallback(
    (callId: string | undefined, code: string, message: string) => {
      if (!callId) return;
      setOutboundCanvasBridgeMessage({
        id: generateMessageId(),
        type: "command.result",
        payload: {
          v: 1,
          callId,
          ok: false,
          error: {
            code,
            message,
            retryable: false,
          },
          durationMs: 0,
        },
      });
    },
    [],
  );

  const onCanvasBridgeMessage = useCallback(
    (message: CanvasBridgeInboundMessage) => {
      const bridge = bridgeRef.current;
      const callId =
        typeof message.payload.callId === "string" ? message.payload.callId : undefined;
      if (!bridge || bridgeState !== "connected") {
        emitCommandFailureToCanvas(
          callId,
          "BRIDGE_UNAVAILABLE",
          "Command failed because live bridge is unavailable.",
        );
        return;
      }

      commandProcessingQueueRef.current = commandProcessingQueueRef.current
        .then(async () => {
          const ready = await ensureChannelReady(bridge, CHANNELS.COMMAND);
          if (!ready) {
            emitCommandFailureToCanvas(
              callId,
              "COMMAND_CHANNEL_NOT_READY",
              "Command channel is not ready.",
            );
            return;
          }

          if (message.type === "command.bind") {
            const bindPayload = {
              v: typeof message.payload.v === "number" ? message.payload.v : 1,
              manifestId:
                typeof message.payload.manifestId === "string" &&
                message.payload.manifestId.length > 0
                  ? message.payload.manifestId
                  : `manifest-${generateMessageId()}`,
              functions: Array.isArray(message.payload.functions) ? message.payload.functions : [],
            };
            const delivered = await bridge.sendWithAck(
              CHANNELS.COMMAND,
              makeEventMessage("command.bind", bindPayload),
              COMMAND_ACK_TIMEOUT_MS,
            );
            if (!delivered) {
              setOutboundCanvasBridgeMessage({
                id: generateMessageId(),
                type: "command.bind.result",
                payload: {
                  v: 1,
                  manifestId: bindPayload.manifestId,
                  accepted: [],
                  rejected: [
                    {
                      name: "*",
                      code: "BIND_DELIVERY_FAILED",
                      message: "Failed to deliver command manifest to daemon.",
                    },
                  ],
                },
              });
            }
            return;
          }

          if (message.type === "command.cancel") {
            const payload = {
              v: typeof message.payload.v === "number" ? message.payload.v : 1,
              callId: callId ?? "",
              reason:
                typeof message.payload.reason === "string" ? message.payload.reason : undefined,
            };
            if (payload.callId.length === 0) return;
            await bridge.sendWithAck(
              CHANNELS.COMMAND,
              makeEventMessage("command.cancel", payload),
              COMMAND_ACK_TIMEOUT_MS,
            );
            return;
          }

          const invokePayload = {
            v: typeof message.payload.v === "number" ? message.payload.v : 1,
            callId: callId ?? "",
            name: typeof message.payload.name === "string" ? message.payload.name : "",
            args:
              message.payload.args && typeof message.payload.args === "object"
                ? (message.payload.args as Record<string, unknown>)
                : {},
            timeoutMs:
              typeof message.payload.timeoutMs === "number" && message.payload.timeoutMs > 0
                ? message.payload.timeoutMs
                : undefined,
          };
          if (invokePayload.callId.length === 0 || invokePayload.name.length === 0) {
            emitCommandFailureToCanvas(callId, "INVALID_COMMAND_INVOKE", "Invalid command payload.");
            return;
          }
          const delivered = await bridge.sendWithAck(
            CHANNELS.COMMAND,
            makeEventMessage("command.invoke", invokePayload),
            COMMAND_ACK_TIMEOUT_MS,
          );
          if (!delivered) {
            emitCommandFailureToCanvas(
              invokePayload.callId,
              "COMMAND_DELIVERY_FAILED",
              "Command invocation could not be delivered.",
            );
          }
        })
        .catch((error) => {
          console.warn("Failed to route canvas command bridge event", error);
          emitCommandFailureToCanvas(
            callId,
            "COMMAND_ROUTE_FAILED",
            "Command invocation failed to route to daemon.",
          );
        });
    },
    [bridgeRef, bridgeState, emitCommandFailureToCanvas],
  );

  return {
    bridgeRef,
    bridgeState,
    canvasHtml,
    clearCanvas,
    lastAgentActivityAt,
    lastUserDeliveredAt,
    onCanvasBridgeMessage,
    outboundCanvasBridgeMessage,
    sendAudio,
    sendChat,
    sendFile,
    sendRenderError,
    setViewMode,
    viewMode,
  };
}
