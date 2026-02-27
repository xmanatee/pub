import { describe, expect, it } from "vitest";
import {
  CHANNELS,
  CONTROL_CHANNEL,
  DEFAULT_TUNNEL_EXPIRY_MS,
  decodeMessage,
  encodeMessage,
  generateMessageId,
  generateTunnelId,
  MAX_TUNNEL_EXPIRY_MS,
  MAX_TUNNELS_PER_USER,
  makeBinaryMetaMessage,
  makeEventMessage,
  makeHtmlMessage,
  makeStreamEnd,
  makeStreamStart,
  makeTextMessage,
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

  it("makeStreamEnd creates stream-end type", () => {
    const msg = makeStreamEnd("stream-123");
    expect(msg.type).toBe("stream-end");
    expect(msg.meta?.streamId).toBe("stream-123");
  });
});

describe("generateTunnelId", () => {
  it("returns 16-character string", () => {
    const id = generateTunnelId();
    expect(id).toHaveLength(16);
  });

  it("contains only lowercase alphanumeric chars", () => {
    const id = generateTunnelId();
    expect(id).toMatch(/^[a-z0-9]+$/);
  });

  it("generates unique IDs", () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateTunnelId()));
    expect(ids.size).toBe(50);
  });
});

describe("constants", () => {
  it("CONTROL_CHANNEL is _control", () => {
    expect(CONTROL_CHANNEL).toBe("_control");
  });

  it("CHANNELS has expected keys", () => {
    expect(CHANNELS.CHAT).toBe("chat");
    expect(CHANNELS.CANVAS).toBe("canvas");
    expect(CHANNELS.AUDIO).toBe("audio");
    expect(CHANNELS.MEDIA).toBe("media");
    expect(CHANNELS.FILE).toBe("file");
  });

  it("MAX_TUNNEL_EXPIRY_MS is 7 days", () => {
    expect(MAX_TUNNEL_EXPIRY_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("DEFAULT_TUNNEL_EXPIRY_MS is 24 hours", () => {
    expect(DEFAULT_TUNNEL_EXPIRY_MS).toBe(24 * 60 * 60 * 1000);
  });

  it("MAX_TUNNELS_PER_USER is 5", () => {
    expect(MAX_TUNNELS_PER_USER).toBe(5);
  });
});
