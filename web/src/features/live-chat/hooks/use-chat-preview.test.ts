/** @vitest-environment jsdom */
import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  AttachmentChatEntry,
  AudioChatEntry,
  ChatEntry,
  SystemChatEntry,
  TextChatEntry,
} from "~/features/live-chat/types/live-chat-types";
import {
  buildChatPreviewText,
  findLastPreviewEntry,
  previewFromChatEntry,
  useChatPreview,
} from "./use-chat-preview";

(
  globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  }
).IS_REACT_ACT_ENVIRONMENT = true;

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

const AGENT_ATTACHMENT: AttachmentChatEntry = {
  id: "f1",
  type: "attachment",
  from: "agent",
  filename: "report.pdf",
  mime: "application/pdf",
  size: 120,
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

let latestPreview: ReturnType<typeof useChatPreview> | null = null;
let container: HTMLDivElement | null = null;
let root: Root | null = null;

function HookHarness({ messages }: { messages: ChatEntry[] }) {
  const preview = useChatPreview(messages, "canvas");

  useEffect(() => {
    latestPreview = preview;
  }, [preview]);

  return null;
}

describe("useChatPreview helpers", () => {
  beforeEach(() => {
    latestPreview = null;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    const currentRoot = root;
    if (currentRoot) {
      await act(async () => {
        currentRoot.unmount();
      });
    }
    root = null;
    container?.remove();
    container = null;
    latestPreview = null;
  });

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

  it("includes filename for attachment previews", () => {
    const preview = previewFromChatEntry(AGENT_ATTACHMENT);
    expect(preview).toEqual({
      source: "agent",
      text: "File: report.pdf",
    });
  });

  it("ignores user-originated entries", () => {
    const preview = previewFromChatEntry(USER_TEXT);
    expect(preview).toBeNull();
  });

  it("formats text for each supported message type", () => {
    expect(buildChatPreviewText(AGENT_TEXT)).toBe("agent reply");
    expect(buildChatPreviewText(AGENT_AUDIO)).toBe("Audio message");
    expect(buildChatPreviewText(AGENT_ATTACHMENT)).toBe("File: report.pdf");
    expect(buildChatPreviewText(SYSTEM_ERROR)).toBe("connection failed");
  });

  it("treats same-id content changes as a new preview", () => {
    const currentRoot = root;
    if (!currentRoot) throw new Error("root not initialized");

    act(() => {
      currentRoot.render(createElement(HookHarness, { messages: [AGENT_TEXT] }));
    });

    expect(latestPreview?.preview).toBeNull();

    act(() => {
      currentRoot.render(
        createElement(HookHarness, {
          messages: [
            {
              ...AGENT_TEXT,
              content: "updated agent reply",
            },
          ],
        }),
      );
    });

    expect(latestPreview?.preview).toEqual({
      source: "agent",
      text: "updated agent reply",
    });
  });
});
