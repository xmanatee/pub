import { useCallback, useEffect, useRef, useState } from "react";
import type { LiveViewMode } from "~/features/live/types/live-types";
import type { ChatEntry } from "~/features/live-chat/types/live-chat-types";

const AUTO_DISMISS_MS = 5_000;

export function useChatPreview(messages: ChatEntry[], viewMode: LiveViewMode) {
  const [previewText, setPreviewText] = useState<string | null>(null);
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
    setPreviewText(null);
  }, [clearTimer]);

  useEffect(() => {
    const lastAgent = findLastAgentMessage(messages);

    if (!initializedRef.current) {
      initializedRef.current = true;
      lastSeenIdRef.current = lastAgent?.id ?? null;
      return;
    }

    if (viewMode === "chat") {
      if (lastAgent) lastSeenIdRef.current = lastAgent.id;
      dismissPreview();
      return;
    }

    if (!lastAgent || lastAgent.id === lastSeenIdRef.current) return;

    lastSeenIdRef.current = lastAgent.id;
    setPreviewText(buildChatPreviewText(lastAgent));
    clearTimer();
    timerRef.current = setTimeout(() => setPreviewText(null), AUTO_DISMISS_MS);
  }, [viewMode, messages, clearTimer, dismissPreview]);

  useEffect(() => clearTimer, [clearTimer]);

  return { previewText, dismissPreview };
}

function findLastAgentMessage(messages: ChatEntry[]): ChatEntry | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].from === "agent") return messages[i];
  }
  return null;
}

export function buildChatPreviewText(entry: ChatEntry): string {
  if (entry.type === "text") return entry.content;
  if (entry.type === "audio") return "Audio message";
  if (entry.type === "image") return "Image";
  return entry.filename ? `File: ${entry.filename}` : "File";
}
