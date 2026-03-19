import { describe, expect, it } from "vitest";
import { readSdkAssistantText } from "./event-reader.js";

describe("readSdkAssistantText", () => {
  describe("SDKAssistantMessage (type: assistant)", () => {
    it("extracts text from a single text block", () => {
      const msg = {
        type: "assistant",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "Hello world" }],
        },
      };
      expect(readSdkAssistantText(msg)).toBe("Hello world");
    });

    it("extracts only text blocks from mixed content", () => {
      const msg = {
        type: "assistant",
        message: {
          role: "assistant",
          content: [
            { type: "text", text: "Part one" },
            { type: "tool_use", id: "t1", name: "write", input: {} },
            { type: "text", text: " part two" },
          ],
        },
      };
      expect(readSdkAssistantText(msg)).toBe("Part one part two");
    });

    it("returns empty string for empty content array", () => {
      const msg = {
        type: "assistant",
        message: { role: "assistant", content: [] },
      };
      expect(readSdkAssistantText(msg)).toBe("");
    });

    it("returns empty string when message has no content field", () => {
      const msg = {
        type: "assistant",
        message: { role: "assistant" },
      };
      expect(readSdkAssistantText(msg)).toBe("");
    });

    it("returns empty string when message is not an object", () => {
      const msg = {
        type: "assistant",
        message: "not an object",
      };
      expect(readSdkAssistantText(msg)).toBe("");
    });
  });

  describe("SDKPartialAssistantMessage (type: stream_event)", () => {
    it("extracts text from a text_delta event", () => {
      const msg = {
        type: "stream_event",
        event: {
          type: "content_block_delta",
          index: 0,
          delta: { type: "text_delta", text: "streaming chunk" },
        },
      };
      expect(readSdkAssistantText(msg)).toBe("streaming chunk");
    });

    it("returns empty string for input_json_delta", () => {
      const msg = {
        type: "stream_event",
        event: {
          type: "content_block_delta",
          index: 0,
          delta: { type: "input_json_delta", partial_json: '{"key":' },
        },
      };
      expect(readSdkAssistantText(msg)).toBe("");
    });

    it("returns empty string for non-delta event types", () => {
      const msg = {
        type: "stream_event",
        event: { type: "message_start", message: {} },
      };
      expect(readSdkAssistantText(msg)).toBe("");
    });

    it("returns empty string when event has no delta", () => {
      const msg = {
        type: "stream_event",
        event: { type: "content_block_delta", index: 0 },
      };
      expect(readSdkAssistantText(msg)).toBe("");
    });
  });

  describe("other event types", () => {
    it("returns empty string for result type", () => {
      const msg = { type: "result", subtype: "success", session_id: "abc" };
      expect(readSdkAssistantText(msg)).toBe("");
    });

    it("returns empty string for status type", () => {
      const msg = { type: "status", status: "running" };
      expect(readSdkAssistantText(msg)).toBe("");
    });
  });

  describe("non-event inputs", () => {
    it("returns empty string for null", () => {
      expect(readSdkAssistantText(null)).toBe("");
    });

    it("returns empty string for undefined", () => {
      expect(readSdkAssistantText(undefined)).toBe("");
    });

    it("returns empty string for a string", () => {
      expect(readSdkAssistantText("hello")).toBe("");
    });

    it("returns empty string for a number", () => {
      expect(readSdkAssistantText(42)).toBe("");
    });

    it("returns empty string for object with no type field", () => {
      expect(readSdkAssistantText({ text: "no type" })).toBe("");
    });
  });
});
