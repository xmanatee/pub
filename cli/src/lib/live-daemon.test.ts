import { describe, expect, it } from "vitest";
import { resolveAckChannel } from "./ack-routing.js";
import type { BridgeMessage } from "./bridge-protocol.js";
import {
  getSignalPollDelayMs,
  getStickyCanvasHtml,
  getLiveWriteReadinessError,
  MAX_CANVAS_PERSIST_SIZE,
  shouldRecoverForBrowserOfferChange,
} from "./live-daemon-shared.js";

describe("getLiveWriteReadinessError", () => {
  it("blocks writes before browser connection", () => {
    expect(getLiveWriteReadinessError(false)).toBe(
      "No browser connected. Ask the user to open the pub URL first, then retry.",
    );
  });

  it("allows writes after browser connection", () => {
    expect(getLiveWriteReadinessError(true)).toBeNull();
  });
});

describe("shouldRecoverForBrowserOfferChange", () => {
  it("does not trigger when incoming offer is undefined", () => {
    expect(
      shouldRecoverForBrowserOfferChange({
        incomingBrowserOffer: undefined,
        lastAppliedBrowserOffer: "offer-v1",
      }),
    ).toBe(false);
  });

  it("does not trigger when no previous offer was applied", () => {
    expect(
      shouldRecoverForBrowserOfferChange({
        incomingBrowserOffer: "offer-v1",
        lastAppliedBrowserOffer: null,
      }),
    ).toBe(false);
  });

  it("does not trigger when offer has not changed", () => {
    expect(
      shouldRecoverForBrowserOfferChange({
        incomingBrowserOffer: "offer-v1",
        lastAppliedBrowserOffer: "offer-v1",
      }),
    ).toBe(false);
  });

  it("triggers when a new browser offer arrives after a previous one was applied", () => {
    expect(
      shouldRecoverForBrowserOfferChange({
        incomingBrowserOffer: "offer-v2",
        lastAppliedBrowserOffer: "offer-v1",
      }),
    ).toBe(true);
  });
});

describe("resolveAckChannel", () => {
  it("prefers message channel when available", () => {
    expect(
      resolveAckChannel({
        controlChannelOpen: true,
        messageChannelOpen: true,
        messageChannel: "chat",
      }),
    ).toBe("chat");
  });

  it("falls back to control channel when message channel is unavailable", () => {
    expect(
      resolveAckChannel({
        controlChannelOpen: true,
        messageChannelOpen: false,
        messageChannel: "chat",
      }),
    ).toBe("_control");
  });

  it("returns null when no channel can carry ack", () => {
    expect(
      resolveAckChannel({
        controlChannelOpen: false,
        messageChannelOpen: false,
        messageChannel: "chat",
      }),
    ).toBeNull();
  });
});

describe("getSignalPollDelayMs", () => {
  it("returns the base polling delay when retry-after is missing", () => {
    expect(getSignalPollDelayMs({ hasActiveConnection: false })).toBe(5_000);
    expect(getSignalPollDelayMs({ hasActiveConnection: true })).toBe(15_000);
  });

  it("honors retry-after when it exceeds the base delay", () => {
    expect(getSignalPollDelayMs({ hasActiveConnection: false, retryAfterSeconds: 12 })).toBe(
      12_000,
    );
  });

  it("ignores non-positive retry-after values", () => {
    expect(getSignalPollDelayMs({ hasActiveConnection: false, retryAfterSeconds: 0 })).toBe(5_000);
    expect(getSignalPollDelayMs({ hasActiveConnection: false, retryAfterSeconds: -1 })).toBe(5_000);
  });
});

describe("getStickyCanvasHtml", () => {
  const CANVAS = "canvas";

  function makeMsg(overrides: Partial<BridgeMessage>): BridgeMessage {
    return { id: "test-1", type: "html", data: "<h1>hi</h1>", ...overrides };
  }

  it("returns null for empty map", () => {
    expect(getStickyCanvasHtml(new Map(), CANVAS)).toBeNull();
  });

  it("returns null when canvas channel has no entry", () => {
    const map = new Map<string, BridgeMessage>([["chat", makeMsg({})]]);
    expect(getStickyCanvasHtml(map, CANVAS)).toBeNull();
  });

  it("returns null for non-html type", () => {
    const map = new Map<string, BridgeMessage>([[CANVAS, makeMsg({ type: "text" })]]);
    expect(getStickyCanvasHtml(map, CANVAS)).toBeNull();
  });

  it("returns null for empty data", () => {
    const map = new Map<string, BridgeMessage>([[CANVAS, makeMsg({ data: "" })]]);
    expect(getStickyCanvasHtml(map, CANVAS)).toBeNull();
  });

  it("returns html string for valid entry", () => {
    const html = "<div>hello world</div>";
    const map = new Map<string, BridgeMessage>([[CANVAS, makeMsg({ data: html })]]);
    expect(getStickyCanvasHtml(map, CANVAS)).toBe(html);
  });

  it("returns null when content exceeds max size", () => {
    const html = "x".repeat(MAX_CANVAS_PERSIST_SIZE + 1);
    const map = new Map<string, BridgeMessage>([[CANVAS, makeMsg({ data: html })]]);
    expect(getStickyCanvasHtml(map, CANVAS)).toBeNull();
  });

  it("returns content at exactly max size", () => {
    const html = "x".repeat(MAX_CANVAS_PERSIST_SIZE);
    const map = new Map<string, BridgeMessage>([[CANVAS, makeMsg({ data: html })]]);
    expect(getStickyCanvasHtml(map, CANVAS)).toBe(html);
  });
});
