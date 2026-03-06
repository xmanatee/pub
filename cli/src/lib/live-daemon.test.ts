import { describe, expect, it } from "vitest";
import { resolveAckChannel } from "../../../shared/ack-routing-core";
import {
  getLiveWriteReadinessError,
  readCanvasHtmlFromOutbound,
  shouldRecoverForBrowserOfferChange,
} from "./live-daemon-shared.js";

describe("getLiveWriteReadinessError", () => {
  it("blocks writes before live session establishment", () => {
    expect(getLiveWriteReadinessError(false)).toBe(
      "Live session is not established yet. Wait for browser connect and initial context sync, then retry.",
    );
  });

  it("allows writes after live session establishment", () => {
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

describe("readCanvasHtmlFromOutbound", () => {
  it("returns html payload only for canvas html messages", () => {
    expect(
      readCanvasHtmlFromOutbound({
        channel: "canvas",
        msg: { id: "m1", type: "html", data: "<h1>Hello</h1>" },
      }),
    ).toBe("<h1>Hello</h1>");
  });

  it("returns null for non-canvas channels", () => {
    expect(
      readCanvasHtmlFromOutbound({
        channel: "chat",
        msg: { id: "m2", type: "html", data: "<h1>Hello</h1>" },
      }),
    ).toBeNull();
  });

  it("returns null for non-html or empty html payloads", () => {
    expect(
      readCanvasHtmlFromOutbound({
        channel: "canvas",
        msg: { id: "m3", type: "text", data: "hello" },
      }),
    ).toBeNull();
    expect(
      readCanvasHtmlFromOutbound({
        channel: "canvas",
        msg: { id: "m4", type: "html", data: "" },
      }),
    ).toBeNull();
  });
});
