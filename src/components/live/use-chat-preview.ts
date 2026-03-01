import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatEntry, LiveViewMode } from "./types";

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
    setPreviewText(lastAgent.content);
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
