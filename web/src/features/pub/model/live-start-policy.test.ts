import { describe, expect, it } from "vitest";
import { deriveDefaultLiveRequested, deriveLiveStartPolicy } from "./live-start-policy";

describe("deriveLiveStartPolicy", () => {
  it("auto-requests live for empty pubs even without a manifest", () => {
    expect(
      deriveDefaultLiveRequested({
        contentState: "empty",
        hasCommandManifest: false,
      }),
    ).toBe(true);
  });

  it("does not auto-request live for ready static pubs without a manifest", () => {
    expect(
      deriveDefaultLiveRequested({
        contentState: "ready",
        hasCommandManifest: false,
      }),
    ).toBe(false);
  });

  it("auto-requests live for manifest pubs", () => {
    expect(
      deriveDefaultLiveRequested({
        contentState: "ready",
        hasCommandManifest: true,
      }),
    ).toBe(true);
  });

  it("collapses static pubs by default and keeps them optional-live", () => {
    expect(
      deriveLiveStartPolicy({
        availableAgentCount: 0,
        hasCanvasContent: true,
        hasCommandManifest: false,
        liveRequested: false,
        selectedPresenceId: null,
      }),
    ).toEqual({
      autoStartAvailable: false,
      defaultCollapsed: true,
      optionalLive: true,
      requiresUserAction: false,
    });
  });

  it("collapses manifest pubs when exactly one agent can auto-start them", () => {
    expect(
      deriveLiveStartPolicy({
        availableAgentCount: 1,
        hasCanvasContent: true,
        hasCommandManifest: true,
        liveRequested: true,
        selectedPresenceId: null,
      }),
    ).toEqual({
      autoStartAvailable: true,
      defaultCollapsed: true,
      optionalLive: false,
      requiresUserAction: false,
    });
  });

  it("keeps manifest pubs expanded when zero agents are available", () => {
    expect(
      deriveLiveStartPolicy({
        availableAgentCount: 0,
        hasCanvasContent: true,
        hasCommandManifest: true,
        liveRequested: true,
        selectedPresenceId: null,
      }),
    ).toEqual({
      autoStartAvailable: false,
      defaultCollapsed: false,
      optionalLive: false,
      requiresUserAction: true,
    });
  });

  it("keeps manifest pubs expanded when multiple agents require explicit choice", () => {
    expect(
      deriveLiveStartPolicy({
        availableAgentCount: 2,
        hasCanvasContent: true,
        hasCommandManifest: true,
        liveRequested: true,
        selectedPresenceId: null,
      }),
    ).toEqual({
      autoStartAvailable: false,
      defaultCollapsed: false,
      optionalLive: false,
      requiresUserAction: true,
    });
  });

  it("treats an already selected agent as no longer requiring user action", () => {
    expect(
      deriveLiveStartPolicy({
        availableAgentCount: 2,
        hasCanvasContent: true,
        hasCommandManifest: true,
        liveRequested: true,
        selectedPresenceId: "presence-1",
      }),
    ).toEqual({
      autoStartAvailable: false,
      defaultCollapsed: true,
      optionalLive: false,
      requiresUserAction: false,
    });
  });
});
