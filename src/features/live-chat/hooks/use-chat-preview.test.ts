import { describe, expect, it } from "vitest";
import type { ChatEntry } from "~/features/live-chat/types/live-chat-types";
import { buildChatPreviewText } from "./use-chat-preview";

describe("buildChatPreviewText", () => {
  it("returns text content for text messages", () => {
    const entry: ChatEntry = {
      id: "t-1",
      type: "text",
      from: "agent",
      content: "hello world",
      timestamp: 1,
    };
    expect(buildChatPreviewText(entry)).toBe("hello world");
  });

  it("returns semantic labels for audio and image messages", () => {
    const audio: ChatEntry = {
      id: "a-1",
      type: "audio",
      from: "agent",
      audioUrl: "blob:audio",
      mime: "audio/webm",
      size: 10,
      timestamp: 1,
    };
    const image: ChatEntry = {
      id: "i-1",
      type: "image",
      from: "agent",
      imageUrl: "blob:image",
      mime: "image/png",
      timestamp: 2,
    };
    expect(buildChatPreviewText(audio)).toBe("Audio message");
    expect(buildChatPreviewText(image)).toBe("Image");
  });

  it("includes filename for attachment messages", () => {
    const attachment: ChatEntry = {
      id: "f-1",
      type: "attachment",
      from: "agent",
      filename: "report.pdf",
      mime: "application/pdf",
      size: 100,
      timestamp: 3,
    };
    expect(buildChatPreviewText(attachment)).toBe("File: report.pdf");
  });
});
