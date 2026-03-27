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

  it("blocks a host that is already serving another pub", () => {
    expect(() =>
      resolveConnectionRequest({
        browserSessionId: "session-a",
        slugConnection: null,
        hostConnection: {
          _id: connectionId("conn-b"),
          activeSlug: "other",
          browserSessionId: "session-b",
        },
      }),
    ).toThrow("Selected agent is busy with another pub.");
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
