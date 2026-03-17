import { useCallback, useEffect, useReducer, useRef } from "react";
import type {
  AudioChatEntry,
  ChatDeliveryState,
  ChatEntry,
  SystemMessageSeverity,
  UserChatEntry,
} from "~/features/live-chat/types/live-chat-types";

const SYSTEM_MESSAGE_COOLDOWN_MS = 4_000;

export interface LiveChatDeliveryState {
  indexById: Record<string, number>;
  messages: ChatEntry[];
}

export function createInitialLiveChatDeliveryState(): LiveChatDeliveryState {
  return {
    messages: [],
    indexById: {},
  };
}

type LiveChatDeliveryAction =
  | { type: "UPSERT_MESSAGE"; entry: ChatEntry }
  | { type: "MARK_MESSAGE_SENT_IF_PENDING"; messageId: string }
  | { type: "MARK_MESSAGE_RECEIVED"; messageId: string }
  | { type: "MARK_MESSAGE_CONFIRMED"; messageId: string }
  | { type: "MARK_MESSAGE_FAILED_IF_PENDING"; messageId: string }
  | { type: "MARK_MESSAGE_FAILED"; messageId: string }
  | { type: "FAIL_SENT_MESSAGES" }
  | {
      type: "UPDATE_AUDIO_MESSAGE_ANALYSIS";
      messageId: string;
      duration: number;
      waveform: number[];
    }
  | { type: "CLEAR_MESSAGES" };

export function liveChatDeliveryReducer(
  state: LiveChatDeliveryState,
  action: LiveChatDeliveryAction,
): LiveChatDeliveryState {
  switch (action.type) {
    case "UPSERT_MESSAGE":
      return upsertMessage(state, action.entry);

    case "MARK_MESSAGE_SENT_IF_PENDING":
      return updateUserDelivery(state, action.messageId, (current) =>
        current === "sending" ? "sent" : current,
      );

    case "MARK_MESSAGE_RECEIVED":
      return updateUserDelivery(state, action.messageId, (current) =>
        current === "sending" || current === "sent" ? "received" : current,
      );

    case "MARK_MESSAGE_CONFIRMED":
      return updateUserDelivery(state, action.messageId, (current) =>
        current === "failed" || current === "confirmed" ? current : "confirmed",
      );

    case "MARK_MESSAGE_FAILED_IF_PENDING":
      return updateUserDelivery(state, action.messageId, (current) =>
        current === "received" || current === "confirmed" ? current : "failed",
      );

    case "MARK_MESSAGE_FAILED":
      return updateUserDelivery(state, action.messageId, (current) =>
        current === "received" || current === "confirmed" ? current : "failed",
      );

    case "FAIL_SENT_MESSAGES": {
      let changed = false;
      const messages = state.messages.map((entry) => {
        if (entry.from !== "user" || entry.delivery !== "sent") return entry;
        changed = true;
        return { ...entry, delivery: "failed" as ChatDeliveryState };
      });
      if (!changed) return state;
      return { ...state, messages };
    }

    case "UPDATE_AUDIO_MESSAGE_ANALYSIS": {
      const index = state.indexById[action.messageId];
      if (index === undefined) return state;
      const entry = state.messages[index];
      if (!entry || entry.type !== "audio") return state;
      const messages = [...state.messages];
      messages[index] = {
        ...entry,
        duration: action.duration,
        waveform: action.waveform,
      } satisfies AudioChatEntry;
      return { ...state, messages };
    }

    case "CLEAR_MESSAGES":
      return createInitialLiveChatDeliveryState();
  }
}

function upsertMessage(state: LiveChatDeliveryState, entry: ChatEntry): LiveChatDeliveryState {
  const existingIndex = state.indexById[entry.id];
  if (existingIndex === undefined) {
    return {
      messages: [...state.messages, entry],
      indexById: { ...state.indexById, [entry.id]: state.messages.length },
    };
  }

  const existing = state.messages[existingIndex];
  if (existing === entry) return state;

  const messages = [...state.messages];
  messages[existingIndex] = entry;
  return { ...state, messages };
}

function updateUserDelivery(
  state: LiveChatDeliveryState,
  messageId: string,
  transform: (current: ChatDeliveryState) => ChatDeliveryState,
): LiveChatDeliveryState {
  const index = state.indexById[messageId];
  if (index === undefined) return state;
  const entry = state.messages[index];
  if (!entry || entry.from !== "user") return state;

  const nextDelivery = transform(entry.delivery);
  if (nextDelivery === entry.delivery) return state;

  const messages = [...state.messages];
  messages[index] = { ...entry, delivery: nextDelivery } satisfies UserChatEntry;
  return { ...state, messages };
}

function getBlobUrls(entry: ChatEntry): string[] {
  if (entry.type === "audio") return entry.audioUrl.startsWith("blob:") ? [entry.audioUrl] : [];
  if (entry.type === "image") return entry.imageUrl.startsWith("blob:") ? [entry.imageUrl] : [];
  if (entry.type === "attachment") {
    return entry.fileUrl?.startsWith("blob:") ? [entry.fileUrl] : [];
  }
  return [];
}

function revokeUrls(urls: string[]) {
  for (const url of urls) URL.revokeObjectURL(url);
}

export function useLiveChatDelivery() {
  const [state, dispatch] = useReducer(
    liveChatDeliveryReducer,
    undefined,
    createInitialLiveChatDeliveryState,
  );
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const entryUrlsRef = useRef<Map<string, string[]>>(new Map());
  const systemMessageCounterRef = useRef(0);
  const systemMessageDedupRef = useRef<Map<string, number>>(new Map());

  const trackEntryUrls = useCallback((entry: ChatEntry) => {
    const nextUrls = getBlobUrls(entry);
    const previousUrls = entryUrlsRef.current.get(entry.id) ?? [];
    for (const url of previousUrls) {
      if (!nextUrls.includes(url)) URL.revokeObjectURL(url);
    }
    if (nextUrls.length === 0) {
      entryUrlsRef.current.delete(entry.id);
      return;
    }
    entryUrlsRef.current.set(entry.id, nextUrls);
  }, []);

  const clearTrackedUrls = useCallback(() => {
    const urlGroups = [...entryUrlsRef.current.values()];
    entryUrlsRef.current.clear();
    for (const urls of urlGroups) revokeUrls(urls);
  }, []);

  useEffect(() => {
    return () => {
      clearTrackedUrls();
    };
  }, [clearTrackedUrls]);

  const addAgentMessage = useCallback(
    (params: { content: string; id: string; timestamp?: number }) => {
      const entry: ChatEntry = {
        type: "text",
        id: params.id,
        from: "agent",
        content: params.content,
        timestamp: params.timestamp ?? Date.now(),
      };
      trackEntryUrls(entry);
      dispatch({ type: "UPSERT_MESSAGE", entry });
    },
    [trackEntryUrls],
  );

  const addAgentAudioMessage = useCallback(
    (params: { audioUrl: string; id: string; mime: string; size: number }) => {
      const entry: AudioChatEntry = {
        type: "audio",
        id: params.id,
        from: "agent",
        audioUrl: params.audioUrl,
        mime: params.mime,
        size: params.size,
        timestamp: Date.now(),
      };
      trackEntryUrls(entry);
      dispatch({ type: "UPSERT_MESSAGE", entry });
    },
    [trackEntryUrls],
  );

  const addAgentImageMessage = useCallback(
    (params: { height?: number; id: string; imageUrl: string; mime: string; width?: number }) => {
      const entry: ChatEntry = {
        type: "image",
        id: params.id,
        from: "agent",
        imageUrl: params.imageUrl,
        mime: params.mime,
        width: params.width,
        height: params.height,
        timestamp: Date.now(),
      };
      trackEntryUrls(entry);
      dispatch({ type: "UPSERT_MESSAGE", entry });
    },
    [trackEntryUrls],
  );

  const addUserPendingMessage = useCallback(
    (params: { content: string; id: string; timestamp?: number }) => {
      const entry: ChatEntry = {
        type: "text",
        id: params.id,
        from: "user",
        content: params.content,
        timestamp: params.timestamp ?? Date.now(),
        delivery: "sending",
      };
      trackEntryUrls(entry);
      dispatch({ type: "UPSERT_MESSAGE", entry });
    },
    [trackEntryUrls],
  );

  const addUserPendingAudioMessage = useCallback(
    (params: { audioUrl: string; id: string; mime: string; size: number }) => {
      const entry: AudioChatEntry = {
        type: "audio",
        id: params.id,
        from: "user",
        audioUrl: params.audioUrl,
        mime: params.mime,
        size: params.size,
        timestamp: Date.now(),
        delivery: "sending",
      };
      trackEntryUrls(entry);
      dispatch({ type: "UPSERT_MESSAGE", entry });
    },
    [trackEntryUrls],
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
      const entry: ChatEntry = {
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
      };
      trackEntryUrls(entry);
      dispatch({ type: "UPSERT_MESSAGE", entry });
    },
    [trackEntryUrls],
  );

  const addUserPendingAttachmentMessage = useCallback(
    (params: { fileUrl?: string; filename: string; id: string; mime: string; size: number }) => {
      const entry: ChatEntry = {
        type: "attachment",
        id: params.id,
        from: "user",
        filename: params.filename,
        mime: params.mime,
        size: params.size,
        fileUrl: params.fileUrl,
        timestamp: Date.now(),
        delivery: "sending",
      };
      trackEntryUrls(entry);
      dispatch({ type: "UPSERT_MESSAGE", entry });
    },
    [trackEntryUrls],
  );

  const addSystemMessage = useCallback(
    (params: {
      content: string;
      severity: SystemMessageSeverity;
      dedupeKey?: string;
      cooldownMs?: number;
      details?: string;
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
      const details = params.details?.trim();
      const entry: ChatEntry = {
        type: "system",
        id: `sys-${now}-${systemMessageCounterRef.current}`,
        from: "system",
        content,
        severity: params.severity,
        timestamp: now,
        ...(details ? { details } : {}),
      };
      dispatch({ type: "UPSERT_MESSAGE", entry });
    },
    [],
  );

  const markMessageSentIfPending = useCallback((messageId: string) => {
    dispatch({ type: "MARK_MESSAGE_SENT_IF_PENDING", messageId });
  }, []);

  const markMessageReceived = useCallback((messageId: string) => {
    dispatch({ type: "MARK_MESSAGE_RECEIVED", messageId });
  }, []);

  const markMessageConfirmed = useCallback((messageId: string) => {
    dispatch({ type: "MARK_MESSAGE_CONFIRMED", messageId });
  }, []);

  const markMessageFailedIfPending = useCallback((messageId: string) => {
    dispatch({ type: "MARK_MESSAGE_FAILED_IF_PENDING", messageId });
  }, []);

  const markMessageFailed = useCallback((messageId: string) => {
    dispatch({ type: "MARK_MESSAGE_FAILED", messageId });
  }, []);

  const failSentMessages = useCallback(() => {
    dispatch({ type: "FAIL_SENT_MESSAGES" });
  }, []);

  const updateAudioMessageAnalysis = useCallback(
    (messageId: string, duration: number, waveform: number[]) => {
      dispatch({
        type: "UPDATE_AUDIO_MESSAGE_ANALYSIS",
        messageId,
        duration,
        waveform,
      });
    },
    [],
  );

  const clearMessages = useCallback(() => {
    clearTrackedUrls();
    systemMessageDedupRef.current.clear();
    dispatch({ type: "CLEAR_MESSAGES" });
  }, [clearTrackedUrls]);

  return {
    addAgentAudioMessage,
    addAgentImageMessage,
    addAgentMessage,
    addSystemMessage,
    addUserPendingAttachmentMessage,
    addUserPendingAudioMessage,
    addUserPendingImageMessage,
    addUserPendingMessage,
    clearMessages,
    failSentMessages,
    markMessageConfirmed,
    markMessageFailed,
    markMessageFailedIfPending,
    markMessageReceived,
    markMessageSentIfPending,
    messages: state.messages,
    messagesEndRef,
    updateAudioMessageAnalysis,
  };
}
