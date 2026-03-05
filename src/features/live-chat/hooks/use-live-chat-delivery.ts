import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AudioChatEntry,
  ChatEntry,
  SystemMessageSeverity,
} from "~/features/live-chat/types/live-chat-types";

const SYSTEM_MESSAGE_COOLDOWN_MS = 4_000;

export function useLiveChatDelivery() {
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const objectUrlsRef = useRef<Set<string>>(new Set());
  const systemMessageCounterRef = useRef(0);
  const systemMessageDedupRef = useRef<Map<string, number>>(new Map());

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    });
  }, []);

  const trackObjectUrl = useCallback((url: string | undefined) => {
    if (!url || !url.startsWith("blob:")) return;
    objectUrlsRef.current.add(url);
  }, []);

  const revokeObjectUrls = useCallback(() => {
    for (const url of objectUrlsRef.current) URL.revokeObjectURL(url);
    objectUrlsRef.current.clear();
  }, []);

  useEffect(() => {
    return () => revokeObjectUrls();
  }, [revokeObjectUrls]);

  const addAgentMessage = useCallback(
    (params: { content: string; id: string; timestamp?: number }) => {
      setMessages((prev) => [
        ...prev,
        {
          type: "text",
          id: params.id,
          from: "agent",
          content: params.content,
          timestamp: params.timestamp ?? Date.now(),
        },
      ]);
      scrollToBottom();
    },
    [scrollToBottom],
  );

  const addAgentAudioMessage = useCallback(
    (params: { audioUrl: string; id: string; mime: string; size: number }) => {
      trackObjectUrl(params.audioUrl);
      setMessages((prev) => [
        ...prev,
        {
          type: "audio",
          id: params.id,
          from: "agent",
          audioUrl: params.audioUrl,
          mime: params.mime,
          size: params.size,
          timestamp: Date.now(),
        },
      ]);
      scrollToBottom();
    },
    [scrollToBottom, trackObjectUrl],
  );

  const addAgentImageMessage = useCallback(
    (params: { height?: number; id: string; imageUrl: string; mime: string; width?: number }) => {
      trackObjectUrl(params.imageUrl);
      setMessages((prev) => [
        ...prev,
        {
          type: "image",
          id: params.id,
          from: "agent",
          imageUrl: params.imageUrl,
          mime: params.mime,
          width: params.width,
          height: params.height,
          timestamp: Date.now(),
        },
      ]);
      scrollToBottom();
    },
    [scrollToBottom, trackObjectUrl],
  );

  const addUserPendingMessage = useCallback(
    (params: { content: string; id: string; timestamp?: number }) => {
      setMessages((prev) => [
        ...prev,
        {
          type: "text",
          id: params.id,
          from: "user",
          content: params.content,
          timestamp: params.timestamp ?? Date.now(),
          delivery: "sending",
        },
      ]);
      scrollToBottom();
    },
    [scrollToBottom],
  );

  const addUserPendingAudioMessage = useCallback(
    (params: { audioUrl: string; id: string; mime: string; size: number }) => {
      trackObjectUrl(params.audioUrl);
      setMessages((prev) => [
        ...prev,
        {
          type: "audio",
          id: params.id,
          from: "user",
          audioUrl: params.audioUrl,
          mime: params.mime,
          size: params.size,
          timestamp: Date.now(),
          delivery: "sending",
        },
      ]);
      scrollToBottom();
    },
    [scrollToBottom, trackObjectUrl],
  );

  const addUserPendingImageMessage = useCallback(
    (params: {
      id: string;
      imageUrl: string;
      mime: string;
      size: number;
      width?: number;
      height?: number;
    }) => {
      trackObjectUrl(params.imageUrl);
      setMessages((prev) => [
        ...prev,
        {
          type: "image",
          id: params.id,
          from: "user",
          imageUrl: params.imageUrl,
          mime: params.mime,
          size: params.size,
          width: params.width,
          height: params.height,
          timestamp: Date.now(),
          delivery: "sending",
        },
      ]);
      scrollToBottom();
    },
    [scrollToBottom, trackObjectUrl],
  );

  const addUserPendingAttachmentMessage = useCallback(
    (params: { fileUrl?: string; filename: string; id: string; mime: string; size: number }) => {
      trackObjectUrl(params.fileUrl);
      setMessages((prev) => [
        ...prev,
        {
          type: "attachment",
          id: params.id,
          from: "user",
          filename: params.filename,
          mime: params.mime,
          size: params.size,
          fileUrl: params.fileUrl,
          timestamp: Date.now(),
          delivery: "sending",
        },
      ]);
      scrollToBottom();
    },
    [scrollToBottom, trackObjectUrl],
  );

  const addSystemMessage = useCallback(
    (params: {
      content: string;
      severity: SystemMessageSeverity;
      dedupeKey?: string;
      cooldownMs?: number;
    }) => {
      const content = params.content.trim();
      if (content.length === 0) return;

      const now = Date.now();
      const cooldownMs = params.cooldownMs ?? SYSTEM_MESSAGE_COOLDOWN_MS;
      if (params.dedupeKey) {
        const dedupeId = `${params.severity}:${params.dedupeKey}`;
        const lastShownAt = systemMessageDedupRef.current.get(dedupeId);
        if (lastShownAt && now - lastShownAt < cooldownMs) return;
        systemMessageDedupRef.current.set(dedupeId, now);
      }

      systemMessageCounterRef.current += 1;
      setMessages((prev) => [
        ...prev,
        {
          type: "system",
          id: `sys-${now}-${systemMessageCounterRef.current}`,
          from: "system",
          content,
          severity: params.severity,
          timestamp: now,
        },
      ]);
      scrollToBottom();
    },
    [scrollToBottom],
  );

  const markMessageSentIfPending = useCallback((messageId: string) => {
    setMessages((prev) =>
      prev.map((entry) =>
        entry.from === "user" && entry.id === messageId && entry.delivery === "sending"
          ? { ...entry, delivery: "sent" }
          : entry,
      ),
    );
  }, []);

  const markMessageReceived = useCallback((messageId: string) => {
    setMessages((prev) =>
      prev.map((entry) =>
        entry.from === "user" &&
        entry.id === messageId &&
        (entry.delivery === "sending" || entry.delivery === "sent")
          ? { ...entry, delivery: "received" }
          : entry,
      ),
    );
  }, []);

  const markMessageConfirmed = useCallback((messageId: string) => {
    setMessages((prev) =>
      prev.map((entry) =>
        entry.from === "user" &&
        entry.id === messageId &&
        (entry.delivery === "sending" || entry.delivery === "sent" || entry.delivery === "received")
          ? { ...entry, delivery: "confirmed" }
          : entry,
      ),
    );
  }, []);

  const markMessageFailedIfPending = useCallback((messageId: string) => {
    setMessages((prev) =>
      prev.map((entry) =>
        entry.from === "user" &&
        entry.id === messageId &&
        entry.delivery !== "confirmed" &&
        entry.delivery !== "received"
          ? { ...entry, delivery: "failed" }
          : entry,
      ),
    );
  }, []);

  const markMessageFailed = useCallback((messageId: string) => {
    setMessages((prev) =>
      prev.map((entry) =>
        entry.from === "user" && entry.id === messageId ? { ...entry, delivery: "failed" } : entry,
      ),
    );
  }, []);

  const failSentMessages = useCallback(() => {
    setMessages((prev) =>
      prev.map((entry) =>
        entry.from === "user" && entry.delivery === "sent"
          ? { ...entry, delivery: "failed" }
          : entry,
      ),
    );
  }, []);

  const updateAudioMessageAnalysis = useCallback(
    (messageId: string, duration: number, waveform: number[]) => {
      setMessages((prev) =>
        prev.map((entry) =>
          entry.type === "audio" && entry.id === messageId
            ? ({ ...entry, duration, waveform } satisfies AudioChatEntry)
            : entry,
        ),
      );
    },
    [],
  );

  const clearMessages = useCallback(() => {
    revokeObjectUrls();
    systemMessageDedupRef.current.clear();
    setMessages([]);
  }, [revokeObjectUrls]);

  return {
    addAgentAudioMessage,
    addAgentImageMessage,
    addAgentMessage,
    addUserPendingAttachmentMessage,
    addUserPendingAudioMessage,
    addUserPendingImageMessage,
    addUserPendingMessage,
    addSystemMessage,
    clearMessages,
    failSentMessages,
    markMessageConfirmed,
    markMessageFailed,
    markMessageFailedIfPending,
    markMessageReceived,
    markMessageSentIfPending,
    messages,
    messagesEndRef,
    updateAudioMessageAnalysis,
  };
}
