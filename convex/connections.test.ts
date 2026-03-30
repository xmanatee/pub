import { describe, expect, it } from "vitest";
import type { Id } from "./_generated/dataModel";
import { resolveConnectionRequest } from "./connections";

function connectionId(value: string): Id<"connections"> {
  return value as Id<"connections">;
}

describe("resolveConnectionRequest", () => {
  it("refreshes the existing slug connection for the current browser session", () => {
    const result = resolveConnectionRequest({
      browserSessionId: "session-a",
      slugConnection: {
        _id: connectionId("conn-a"),
        activeSlug: "demo",
        browserSessionId: "session-a",
      },
      hostConnection: {
        _id: connectionId("conn-a"),
        activeSlug: "demo",
        browserSessionId: "session-a",
      },
    });

    expect(result).toEqual({
      type: "refresh",
      connectionId: connectionId("conn-a"),
    });
  });

  it("requires takeover when another browser session owns the slug", () => {
    expect(() =>
      resolveConnectionRequest({
        browserSessionId: "session-b",
        slugConnection: {
          _id: connectionId("conn-a"),
          activeSlug: "demo",
          browserSessionId: "session-a",
        },
        hostConnection: {
          _id: connectionId("conn-a"),
          activeSlug: "demo",
          browserSessionId: "session-a",
        },
      }),
    ).toThrow("Live session is active on another device. Take over to continue.");
  });

  it("refreshes host and marks slug connection stale when both exist for different pubs", () => {
    const result = resolveConnectionRequest({
      browserSessionId: "session-a",
      slugConnection: {
        _id: connectionId("conn-a"),
        activeSlug: "demo",
        browserSessionId: "session-a",
      },
      hostConnection: {
        _id: connectionId("conn-b"),
        activeSlug: "other",
        browserSessionId: "session-a",
      },
    });

    expect(result).toEqual({
      type: "refresh",
      connectionId: connectionId("conn-b"),
      staleConnectionId: connectionId("conn-a"),
    });
  });

  it("refreshes the host connection when a different browser session navigates to another pub", () => {
    const result = resolveConnectionRequest({
      browserSessionId: "session-a",
      slugConnection: null,
      hostConnection: {
        _id: connectionId("conn-b"),
        activeSlug: "other",
        browserSessionId: "session-b",
      },
    });

    expect(result).toEqual({
      type: "refresh",
      connectionId: connectionId("conn-b"),
    });
  });

  it("refreshes the host connection when the same browser session navigates to another pub", () => {
    const result = resolveConnectionRequest({
      browserSessionId: "session-a",
      slugConnection: null,
      hostConnection: {
        _id: connectionId("conn-b"),
        activeSlug: "other",
        browserSessionId: "session-a",
      },
    });

    expect(result).toEqual({
      type: "refresh",
      connectionId: connectionId("conn-b"),
    });
  });

  it("inserts a new connection when the slug and host are both free", () => {
    const result = resolveConnectionRequest({
      browserSessionId: "session-a",
      slugConnection: null,
      hostConnection: null,
    });

    expect(result).toEqual({ type: "insert" });
  });
});
