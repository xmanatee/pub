import { useCallback, useRef, useState } from "react";
import type { AudioChatEntry, ChatEntry } from "~/features/live/types/live-types";

export function useLiveChatDelivery() {
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    });
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

  const addUserPendingImageMessage = useCallback(
    (params: {
      id: string;
      imageUrl: string;
      mime: string;
      size: number;
      width?: number;
      height?: number;
    }) => {
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
    [scrollToBottom],
  );

  const addUserPendingAttachmentMessage = useCallback(
    (params: { fileUrl?: string; filename: string; id: string; mime: string; size: number }) => {
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
        (entry.delivery === "sending" ||
          entry.delivery === "sent" ||
          entry.delivery === "received" ||
          entry.delivery === "confirmed")
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
    setMessages([]);
  }, []);

  return {
    addAgentAudioMessage,
    addAgentImageMessage,
    addAgentMessage,
    addUserPendingAttachmentMessage,
    addUserPendingAudioMessage,
    addUserPendingImageMessage,
    addUserPendingMessage,
    clearMessages,
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
