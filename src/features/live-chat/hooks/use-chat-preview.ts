import { useCallback, useEffect, useRef, useState } from "react";
import type { LiveViewMode } from "~/features/live/types/live-types";
import type { ChatEntry, SystemMessageSeverity } from "~/features/live-chat/types/live-chat-types";

const AUTO_DISMISS_MS = 6_000;

export interface ChatPreview {
  source: "agent" | "system";
  severity?: SystemMessageSeverity;
  text: string;
}

export function useChatPreview(messages: ChatEntry[], viewMode: LiveViewMode) {
  const [preview, setPreview] = useState<ChatPreview | null>(null);
  const lastSeenIdRef = useRef<string | null>(null);
  const initializedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const dismissPreview = useCallback(() => {
    clearTimer();
    setPreview(null);
  }, [clearTimer]);

  useEffect(() => {
    const lastPreviewEntry = findLastPreviewEntry(messages);

    if (!initializedRef.current) {
      initializedRef.current = true;
      lastSeenIdRef.current = lastPreviewEntry?.id ?? null;
      return;
    }

    if (viewMode === "chat") {
      if (lastPreviewEntry) lastSeenIdRef.current = lastPreviewEntry.id;
      dismissPreview();
      return;
    }

    if (!lastPreviewEntry || lastPreviewEntry.id === lastSeenIdRef.current) return;

    const nextPreview = previewFromChatEntry(lastPreviewEntry);
    if (!nextPreview) return;
    lastSeenIdRef.current = lastPreviewEntry.id;
    setPreview(nextPreview);
    clearTimer();
    timerRef.current = setTimeout(() => setPreview(null), AUTO_DISMISS_MS);
  }, [viewMode, messages, clearTimer, dismissPreview]);

  useEffect(() => clearTimer, [clearTimer]);

  return { preview, dismissPreview };
}

export function findLastPreviewEntry(messages: ChatEntry[]): ChatEntry | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].from === "agent" || messages[i].from === "system") return messages[i];
  }
  return null;
}

export function buildChatPreviewText(entry: ChatEntry): string {
  if (entry.type === "system") return entry.content;
  if (entry.type === "text") return entry.content;
  if (entry.type === "audio") return "Audio message";
  if (entry.type === "image") return "Image";
  return entry.filename ? `File: ${entry.filename}` : "File";
}

export function previewFromChatEntry(entry: ChatEntry): ChatPreview | null {
  if (entry.from === "user") return null;
  if (entry.type === "system") {
    return {
      source: "system",
      severity: entry.severity,
      text: buildChatPreviewText(entry),
    };
  }

  return {
    source: "agent",
    text: buildChatPreviewText(entry),
  };
}
