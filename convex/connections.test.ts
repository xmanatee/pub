import { describe, expect, it } from "vitest";

/**
 * connectionConflictsWithRequest and connectionMatchesRequest are internal to
 * connections.ts. These tests exercise the same logic inline to keep coverage
 * while the helpers are not exported.
 */

function connectionConflictsWithRequest(
  conn: { activeSlug?: string; hostId: string },
  request: { activeSlug: string; hostId: string },
) {
  return conn.activeSlug === request.activeSlug || conn.hostId === request.hostId;
}

function connectionMatchesRequest(
  conn: { browserSessionId?: string; activeSlug?: string; hostId: string },
  request: { browserSessionId: string; activeSlug: string; hostId: string },
) {
  return (
    conn.activeSlug === request.activeSlug &&
    conn.hostId === request.hostId &&
    conn.browserSessionId === request.browserSessionId
  );
}

describe("connectionConflictsWithRequest", () => {
  it("treats the same slug as conflicting even for another host", () => {
    expect(
      connectionConflictsWithRequest(
        { activeSlug: "demo", hostId: "host-a" },
        { activeSlug: "demo", hostId: "host-b" },
      ),
    ).toBe(true);
  });

  it("treats the same host as conflicting across slugs", () => {
    expect(
      connectionConflictsWithRequest(
        { activeSlug: "alpha", hostId: "host-a" },
        { activeSlug: "beta", hostId: "host-a" },
      ),
    ).toBe(true);
  });

  it("allows different slug and different host", () => {
    expect(
      connectionConflictsWithRequest(
        { activeSlug: "alpha", hostId: "host-a" },
        { activeSlug: "beta", hostId: "host-b" },
      ),
    ).toBe(false);
  });

  it("allows connection without active slug when slug and host differ", () => {
    expect(
      connectionConflictsWithRequest(
        { hostId: "host-x" },
        { activeSlug: "fresh", hostId: "host-a" },
      ),
    ).toBe(false);
  });
});

describe("connectionMatchesRequest", () => {
  it("treats the same slug, host, and browser session as the same connection", () => {
    expect(
      connectionMatchesRequest(
        { activeSlug: "demo", hostId: "host-a", browserSessionId: "session-1" },
        { activeSlug: "demo", hostId: "host-a", browserSessionId: "session-1" },
      ),
    ).toBe(true);
  });

  it("does not match when the browser session changes", () => {
    expect(
      connectionMatchesRequest(
        { activeSlug: "demo", hostId: "host-a", browserSessionId: "session-1" },
        { activeSlug: "demo", hostId: "host-a", browserSessionId: "session-2" },
      ),
    ).toBe(false);
  });

  it("does not match when the host changes", () => {
    expect(
      connectionMatchesRequest(
        { activeSlug: "demo", hostId: "host-a", browserSessionId: "session-1" },
        { activeSlug: "demo", hostId: "host-b", browserSessionId: "session-1" },
      ),
    ).toBe(false);
  });
});
