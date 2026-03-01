import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatEntry } from "./types";

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

  const addUserPendingMessage = useCallback(
    (params: { content: string; id: string; timestamp?: number }) => {
      setMessages((prev) => [
        ...prev,
        {
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
        entry.from === "user" &&
        entry.id === messageId &&
        (entry.delivery === "sending" || entry.delivery === "confirming")
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
    addAgentMessage,
    addUserPendingMessage,
    clearMessages,
    markMessageConfirmingIfPending,
    markMessageDelivered,
    markMessageFailedIfPending,
    markSendingMessagesConfirming,
    messages,
    messagesEndRef,
  };
}
