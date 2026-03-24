import { describe, expect, it } from "vitest";
import {
  type RelayMessage,
  decodeRelayMessage,
  defaultChannelSocketPath,
  encodeRelayMessage,
} from "./relay-protocol.js";

describe("encodeRelayMessage / decodeRelayMessage", () => {
  const cases: Array<{ label: string; msg: RelayMessage }> = [
    {
      label: "briefing",
      msg: { type: "briefing", slug: "test-slug", content: "session briefing text" },
    },
    {
      label: "inbound chat",
      msg: {
        type: "inbound",
        channel: "chat",
        msg: { id: "msg-1", type: "text", data: "hello" },
      },
    },
    {
      label: "outbound chat",
      msg: {
        type: "outbound",
        channel: "chat",
        msg: { id: "msg-2", type: "text", data: "world" },
      },
    },
    {
      label: "outbound canvas",
      msg: {
        type: "outbound",
        channel: "canvas",
        msg: { id: "msg-3", type: "html", data: "<html></html>" },
      },
    },
    {
      label: "activity thinking",
      msg: { type: "activity", state: "thinking" },
    },
    {
      label: "activity idle",
      msg: { type: "activity", state: "idle" },
    },
  ];

  for (const { label, msg } of cases) {
    it(`round-trips ${label}`, () => {
      const encoded = encodeRelayMessage(msg);
      const decoded = decodeRelayMessage(encoded);
      expect(decoded).toEqual(msg);
    });
  }
});

describe("decodeRelayMessage rejects invalid input", () => {
  it("returns null for non-JSON", () => {
    expect(decodeRelayMessage("not json")).toBeNull();
  });

  it("returns null for missing type field", () => {
    expect(decodeRelayMessage('{"channel":"chat"}')).toBeNull();
  });

  it("returns null for unknown type", () => {
    expect(decodeRelayMessage('{"type":"unknown"}')).toBeNull();
  });

  it("returns null for briefing without slug", () => {
    expect(decodeRelayMessage('{"type":"briefing","content":"x"}')).toBeNull();
  });

  it("returns null for briefing without content", () => {
    expect(decodeRelayMessage('{"type":"briefing","slug":"x"}')).toBeNull();
  });

  it("returns null for inbound without msg", () => {
    expect(decodeRelayMessage('{"type":"inbound","channel":"chat"}')).toBeNull();
  });

  it("returns null for outbound without channel", () => {
    expect(decodeRelayMessage('{"type":"outbound","msg":{}}')).toBeNull();
  });

  it("returns null for activity without state", () => {
    expect(decodeRelayMessage('{"type":"activity"}')).toBeNull();
  });
});

describe("defaultChannelSocketPath", () => {
  it("returns a path under /tmp", () => {
    const p = defaultChannelSocketPath();
    expect(p).toMatch(/^\/tmp\/pub-channel-\d+\.sock$/);
  });
});
