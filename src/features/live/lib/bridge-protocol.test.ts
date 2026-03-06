import { describe, expect, it } from "vitest";
import {
  CHANNELS,
  CONTROL_CHANNEL,
  decodeMessage,
  encodeMessage,
  generateMessageId,
  makeAckMessage,
  makeBinaryMetaMessage,
  makeDeliveryReceiptMessage,
  makeEventMessage,
  makeHtmlMessage,
  makeStreamEnd,
  makeStreamStart,
  makeTextMessage,
  parseAckMessage,
  parseDeliveryReceiptMessage,
  shouldAcknowledgeMessage,
} from "./bridge-protocol";

describe("generateMessageId", () => {
  it("returns unique IDs", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateMessageId()));
    expect(ids.size).toBe(100);
  });

  it("returns string IDs", () => {
    expect(typeof generateMessageId()).toBe("string");
  });
});

describe("encodeMessage / decodeMessage", () => {
  it("round-trips a text message", () => {
    const msg = makeTextMessage("hello");
    const encoded = encodeMessage(msg);
    const decoded = decodeMessage(encoded);
    expect(decoded).toEqual(msg);
  });

  it("round-trips an HTML message with title", () => {
    const msg = makeHtmlMessage("<h1>Hi</h1>", "Test Title");
    const decoded = decodeMessage(encodeMessage(msg));
    expect(decoded?.type).toBe("html");
    expect(decoded?.data).toBe("<h1>Hi</h1>");
    expect(decoded?.meta?.title).toBe("Test Title");
  });

  it("returns null for invalid JSON", () => {
    expect(decodeMessage("not-json")).toBeNull();
  });

  it("returns null for valid JSON missing required fields", () => {
    expect(decodeMessage(JSON.stringify({ foo: "bar" }))).toBeNull();
    expect(decodeMessage(JSON.stringify({ id: 123, type: "text" }))).toBeNull();
    expect(decodeMessage(JSON.stringify({ id: "abc" }))).toBeNull();
  });
});

describe("message factories", () => {
  it("makeTextMessage creates text type", () => {
    const msg = makeTextMessage("content");
    expect(msg.type).toBe("text");
    expect(msg.data).toBe("content");
    expect(msg.id).toBeTruthy();
  });

  it("makeHtmlMessage creates html type", () => {
    const msg = makeHtmlMessage("<p>hi</p>");
    expect(msg.type).toBe("html");
    expect(msg.data).toBe("<p>hi</p>");
    expect(msg.meta).toBeUndefined();
  });

  it("makeHtmlMessage includes title in meta", () => {
    const msg = makeHtmlMessage("<p>hi</p>", "My Page");
    expect(msg.meta?.title).toBe("My Page");
  });

  it("makeEventMessage creates event type", () => {
    const msg = makeEventMessage("capabilities", { caps: ["text", "html"] });
    expect(msg.type).toBe("event");
    expect(msg.data).toBe("capabilities");
    expect(msg.meta?.caps).toEqual(["text", "html"]);
  });

  it("makeBinaryMetaMessage creates binary type", () => {
    const msg = makeBinaryMetaMessage({ size: 1024, mime: "image/png" });
    expect(msg.type).toBe("binary");
    expect(msg.meta?.size).toBe(1024);
  });

  it("makeStreamStart creates stream-start type", () => {
    const msg = makeStreamStart({ mime: "audio/pcm", sampleRate: 16000 });
    expect(msg.type).toBe("stream-start");
    expect(msg.meta?.sampleRate).toBe(16000);
  });

  it("makeStreamStart keeps caller-provided stream id", () => {
    const msg = makeStreamStart({ mime: "audio/webm" }, "stream-fixed-id");
    expect(msg.type).toBe("stream-start");
    expect(msg.id).toBe("stream-fixed-id");
  });

  it("makeStreamEnd creates stream-end type", () => {
    const msg = makeStreamEnd("stream-123");
    expect(msg.type).toBe("stream-end");
    expect(msg.meta?.streamId).toBe("stream-123");
  });

  it("makeAckMessage creates ack payload for delivery receipts", () => {
    const msg = makeAckMessage("msg-1", CHANNELS.CHAT);
    expect(msg.type).toBe("event");
    expect(msg.data).toBe("ack");
    expect(msg.meta?.messageId).toBe("msg-1");
    expect(msg.meta?.channel).toBe(CHANNELS.CHAT);
    expect(typeof msg.meta?.receivedAt).toBe("number");
  });

  it("parseAckMessage extracts ack metadata", () => {
    const ack = makeAckMessage("msg-2", CHANNELS.CANVAS);
    expect(parseAckMessage(ack)).toEqual({
      messageId: "msg-2",
      channel: CHANNELS.CANVAS,
      receivedAt: ack.meta?.receivedAt,
    });
  });

  it("makeDeliveryReceiptMessage creates delivery event payload", () => {
    const msg = makeDeliveryReceiptMessage({
      messageId: "msg-4",
      channel: CHANNELS.FILE,
      stage: "confirmed",
    });
    expect(msg.type).toBe("event");
    expect(msg.data).toBe("delivery");
    expect(msg.meta?.messageId).toBe("msg-4");
    expect(msg.meta?.channel).toBe(CHANNELS.FILE);
    expect(msg.meta?.stage).toBe("confirmed");
    expect(typeof msg.meta?.at).toBe("number");
  });

  it("parseDeliveryReceiptMessage extracts delivery receipt metadata", () => {
    const receipt = makeDeliveryReceiptMessage({
      messageId: "msg-5",
      channel: CHANNELS.AUDIO,
      stage: "received",
    });
    expect(parseDeliveryReceiptMessage(receipt)).toEqual({
      messageId: "msg-5",
      channel: CHANNELS.AUDIO,
      stage: "received",
      at: receipt.meta?.at,
      error: undefined,
    });
  });

  it("parseDeliveryReceiptMessage returns null for invalid stage", () => {
    const invalid = makeEventMessage("delivery", {
      messageId: "msg-6",
      channel: CHANNELS.CHAT,
      stage: "unknown",
    });
    expect(parseDeliveryReceiptMessage(invalid)).toBeNull();
  });

  it("shouldAcknowledgeMessage ignores control ack events", () => {
    expect(shouldAcknowledgeMessage(CHANNELS.CHAT, makeTextMessage("hello"))).toBe(true);
    expect(shouldAcknowledgeMessage(CONTROL_CHANNEL, makeEventMessage("status"))).toBe(false);
    expect(shouldAcknowledgeMessage(CHANNELS.CHAT, makeAckMessage("msg-3", CHANNELS.CHAT))).toBe(
      false,
    );
  });
});

describe("constants", () => {
  it("CONTROL_CHANNEL is _control", () => {
    expect(CONTROL_CHANNEL).toBe("_control");
  });

  it("CHANNELS has expected keys", () => {
    expect(CHANNELS.CHAT).toBe("chat");
    expect(CHANNELS.CANVAS).toBe("canvas");
    expect(CHANNELS.RENDER_ERROR).toBe("render-error");
    expect(CHANNELS.AUDIO).toBe("audio");
    expect(CHANNELS.MEDIA).toBe("media");
    expect(CHANNELS.FILE).toBe("file");
    expect(CHANNELS.COMMAND).toBe("command");
  });
});
