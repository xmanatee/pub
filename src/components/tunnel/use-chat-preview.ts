import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatEntry, TunnelViewMode } from "./types";

const AUTO_DISMISS_MS = 5_000;

export function useChatPreview(messages: ChatEntry[], viewMode: TunnelViewMode) {
  const [previewText, setPreviewText] = useState<string | null>(null);
  const lastSeenIdRef = useRef<string | null>(null);
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

  // Track the last message ID seen while in chat mode
  useEffect(() => {
    if (viewMode === "chat") {
      const lastAgent = findLastAgentMessage(messages);
      if (lastAgent) lastSeenIdRef.current = lastAgent.id;
      dismissPreview();
    }
  }, [viewMode, messages, dismissPreview]);

  // Show preview when a new agent message arrives outside chat mode
  useEffect(() => {
    if (viewMode === "chat") return;

    const lastAgent = findLastAgentMessage(messages);
    if (!lastAgent) return;
    if (lastAgent.id === lastSeenIdRef.current) return;

    lastSeenIdRef.current = lastAgent.id;
    setPreviewText(lastAgent.content);

    clearTimer();
    timerRef.current = setTimeout(() => setPreviewText(null), AUTO_DISMISS_MS);
  }, [viewMode, messages, clearTimer]);

  // Cleanup timer on unmount
  useEffect(() => clearTimer, [clearTimer]);

  return { previewText, dismissPreview };
}

function findLastAgentMessage(messages: ChatEntry[]): ChatEntry | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].from === "agent") return messages[i];
  }
  return null;
}
