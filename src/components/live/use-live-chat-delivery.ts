import { useCallback, useEffect, useRef, useState } from "react";
import type { AudioChatEntry, ChatEntry } from "./types";

const DEFAULT_CONFIRM_GRACE_MS = 12_000;

interface UseLiveChatDeliveryOptions {
  confirmGraceMs?: number;
}

export function useLiveChatDelivery(options?: UseLiveChatDeliveryOptions) {
  const confirmGraceMs = options?.confirmGraceMs ?? DEFAULT_CONFIRM_GRACE_MS;
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pendingFailureTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    });
  }, []);

  const clearPendingFailureTimer = useCallback((messageId: string) => {
    const pending = pendingFailureTimersRef.current.get(messageId);
    if (!pending) return;
    clearTimeout(pending);
    pendingFailureTimersRef.current.delete(messageId);
  }, []);

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
    [scrollToBottom],
  );

  const addAgentImageMessage = useCallback(
    (params: { height?: number; id: string; imageUrl: string; mime: string; width?: number }) => {
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
    [scrollToBottom],
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
    [scrollToBottom],
  );

  const markMessageDelivered = useCallback(
    (messageId: string) => {
      clearPendingFailureTimer(messageId);
      setMessages((prev) =>
        prev.map((entry) =>
          entry.from === "user" && entry.id === messageId
            ? { ...entry, delivery: "delivered" }
            : entry,
        ),
      );
    },
    [clearPendingFailureTimer],
  );

  const markMessageConfirmingIfPending = useCallback((messageId: string) => {
    setMessages((prev) =>
      prev.map((entry) =>
        entry.from === "user" && entry.id === messageId && entry.delivery === "sending"
          ? { ...entry, delivery: "confirming" }
          : entry,
      ),
    );
  }, []);

  const markMessageFailedIfPending = useCallback(
    (messageId: string) => {
      clearPendingFailureTimer(messageId);
      setMessages((prev) =>
        prev.map((entry) =>
          entry.from === "user" &&
          entry.id === messageId &&
          (entry.delivery === "sending" || entry.delivery === "confirming")
            ? { ...entry, delivery: "failed" }
            : entry,
        ),
      );
    },
    [clearPendingFailureTimer],
  );

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

  const markSendingMessagesConfirming = useCallback(() => {
    setMessages((prev) =>
      prev.map((entry) =>
        entry.from === "user" && entry.delivery === "sending"
          ? { ...entry, delivery: "confirming" }
          : entry,
      ),
    );
  }, []);

  const clearMessages = useCallback(() => {
    for (const timer of pendingFailureTimersRef.current.values()) clearTimeout(timer);
    pendingFailureTimersRef.current.clear();
    setMessages([]);
  }, []);

  useEffect(() => {
    const confirmingIds = new Set(
      messages
        .filter((entry) => entry.from === "user" && entry.delivery === "confirming")
        .map((entry) => entry.id),
    );

    for (const messageId of confirmingIds) {
      if (pendingFailureTimersRef.current.has(messageId)) continue;
      const timeout = setTimeout(() => {
        markMessageFailedIfPending(messageId);
      }, confirmGraceMs);
      pendingFailureTimersRef.current.set(messageId, timeout);
    }

    for (const [messageId, timeout] of pendingFailureTimersRef.current) {
      if (confirmingIds.has(messageId)) continue;
      clearTimeout(timeout);
      pendingFailureTimersRef.current.delete(messageId);
    }
  }, [messages, confirmGraceMs, markMessageFailedIfPending]);

  useEffect(() => {
    return () => {
      for (const timeout of pendingFailureTimersRef.current.values()) {
        clearTimeout(timeout);
      }
      pendingFailureTimersRef.current.clear();
    };
  }, []);

  return {
    addAgentAudioMessage,
    addAgentImageMessage,
    addAgentMessage,
    addUserPendingAudioMessage,
    addUserPendingMessage,
    clearMessages,
    markMessageConfirmingIfPending,
    markMessageDelivered,
    markMessageFailedIfPending,
    markSendingMessagesConfirming,
    messages,
    messagesEndRef,
    updateAudioMessageAnalysis,
  };
}
