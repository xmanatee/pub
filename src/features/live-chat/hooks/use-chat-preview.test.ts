import { describe, expect, it } from "vitest";
import type {
  AudioChatEntry,
  SystemChatEntry,
  TextChatEntry,
} from "~/features/live-chat/types/live-chat-types";
import { findLastPreviewEntry, previewFromChatEntry } from "./use-chat-preview";

const USER_TEXT: TextChatEntry = {
  id: "u1",
  type: "text",
  from: "user",
  content: "hello",
  timestamp: 1,
  delivery: "sent",
};

const AGENT_TEXT: TextChatEntry = {
  id: "a1",
  type: "text",
  from: "agent",
  content: "agent reply",
  timestamp: 2,
};

const AGENT_AUDIO: AudioChatEntry = {
  id: "a2",
  type: "audio",
  from: "agent",
  audioUrl: "blob:audio",
  mime: "audio/webm",
  size: 100,
  timestamp: 3,
};

const SYSTEM_ERROR: SystemChatEntry = {
  id: "s1",
  type: "system",
  from: "system",
  content: "connection failed",
  severity: "error",
  timestamp: 4,
};

describe("useChatPreview helpers", () => {
  it("finds the latest preview-eligible message", () => {
    const last = findLastPreviewEntry([USER_TEXT, AGENT_TEXT, AGENT_AUDIO, SYSTEM_ERROR]);
    expect(last?.id).toBe("s1");
  });

  it("returns null when no preview-eligible messages exist", () => {
    const last = findLastPreviewEntry([USER_TEXT]);
    expect(last).toBeNull();
  });

  it("maps agent media messages to concise preview text", () => {
    const preview = previewFromChatEntry(AGENT_AUDIO);
    expect(preview).toEqual({
      source: "agent",
      text: "Audio message",
    });
  });

  it("maps system messages with severity", () => {
    const preview = previewFromChatEntry(SYSTEM_ERROR);
    expect(preview).toEqual({
      source: "system",
      severity: "error",
      text: "connection failed",
    });
  });

  it("ignores user-originated entries", () => {
    const preview = previewFromChatEntry(USER_TEXT);
    expect(preview).toBeNull();
  });
});
