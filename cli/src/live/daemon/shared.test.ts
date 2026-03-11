import { describe, expect, it } from "vitest";
import { resolveAckChannel } from "../../../../shared/ack-routing-core";
import { PubApiError } from "../../core/api/client.js";
import {
  getLiveWriteReadinessError,
  isPresenceExpiredError,
  isPresenceOwnershipConflictError,
  shouldRecoverForBrowserOfferChange,
} from "./shared.js";

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

describe("presence error helpers", () => {
  it("detects stale presence errors from the API", () => {
    expect(
      isPresenceExpiredError(new PubApiError("Not online", 409, undefined, "presence_not_online")),
    ).toBe(true);
    expect(
      isPresenceOwnershipConflictError(
        new PubApiError("API key already in use", 409, undefined, "presence_api_key_in_use"),
      ),
    ).toBe(true);
  });

  it("does not match unrelated API errors", () => {
    expect(
      isPresenceExpiredError(
        new PubApiError("API key already in use", 409, undefined, "presence_api_key_in_use"),
      ),
    ).toBe(false);
    expect(
      isPresenceOwnershipConflictError(
        new PubApiError("Not online", 409, undefined, "presence_not_online"),
      ),
    ).toBe(false);
    expect(isPresenceExpiredError(new Error("Not online"))).toBe(false);
  });
});
