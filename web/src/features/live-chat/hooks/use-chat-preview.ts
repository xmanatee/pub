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
  const lastSeenKeyRef = useRef<string | null>(getLastPreviewEntryKey(messages));
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
    if (viewMode === "chat") {
      lastSeenKeyRef.current = getLastPreviewEntryKey(messages);
      dismissPreview();
      return;
    }

    const nextEntry = findNextPreviewEntry(messages, lastSeenKeyRef.current);
    if (!nextEntry) return;

    const nextPreview = previewFromChatEntry(nextEntry.entry);
    if (!nextPreview) return;
    if (isBlockingPreview(preview) && !isBlockingPreview(nextPreview)) return;

    lastSeenKeyRef.current = nextEntry.lastUnseenKey;
    setPreview(nextPreview);
    clearTimer();
    timerRef.current = setTimeout(() => setPreview(null), AUTO_DISMISS_MS);
  }, [viewMode, messages, preview, clearTimer, dismissPreview]);

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

function getPreviewEntryKey(entry: ChatEntry): string {
  if (entry.type === "system") {
    return `${entry.id}:${entry.severity}:${entry.content}`;
  }
  return `${entry.id}:${buildChatPreviewText(entry)}`;
}

function getLastPreviewEntryKey(messages: ChatEntry[]): string | null {
  const entry = findLastPreviewEntry(messages);
  return entry ? getPreviewEntryKey(entry) : null;
}

function findNextPreviewEntry(
  messages: ChatEntry[],
  lastSeenKey: string | null,
): { entry: ChatEntry; lastUnseenKey: string } | null {
  const previewEntries = messages.filter(
    (entry) => entry.from === "agent" || entry.from === "system",
  );
  if (previewEntries.length === 0) return null;

  const lastSeenIndex =
    lastSeenKey === null
      ? -1
      : previewEntries.findIndex((entry) => getPreviewEntryKey(entry) === lastSeenKey);
  const unseen = previewEntries.slice(lastSeenIndex + 1);
  if (unseen.length === 0) return null;

  const lastUnseenKey = getPreviewEntryKey(unseen[unseen.length - 1]);
  const prioritizedEntry =
    [...unseen].reverse().find((entry) => entry.type === "system" && entry.severity === "error") ??
    unseen[unseen.length - 1];

  return {
    entry: prioritizedEntry,
    lastUnseenKey,
  };
}

function isBlockingPreview(preview: ChatPreview | null): boolean {
  return preview?.source === "system" && preview.severity === "error";
}
