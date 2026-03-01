import { describe, expect, it } from "vitest";
import type { Pub } from "../lib/api.js";
import { CLI_VERSION } from "../lib/version.js";
import {
  buildBridgeForkStdio,
  buildDaemonForkStdio,
  getFollowReadDelayMs,
  messageContainsPong,
  parseBridgeMode,
  parsePositiveIntegerOption,
  pickReusableSession,
  resolveSlugSelection,
  shouldRestartDaemonForCliUpgrade,
} from "./tunnel-helpers.js";

describe("getFollowReadDelayMs", () => {
  it("uses steady polling when daemon is reachable", () => {
    expect(getFollowReadDelayMs(false, 0)).toBe(1_000);
    expect(getFollowReadDelayMs(false, 3)).toBe(1_000);
  });

  it("backs off exponentially when disconnected", () => {
    expect(getFollowReadDelayMs(true, 1)).toBe(2_000);
    expect(getFollowReadDelayMs(true, 2)).toBe(4_000);
    expect(getFollowReadDelayMs(true, 3)).toBe(5_000);
    expect(getFollowReadDelayMs(true, 10)).toBe(5_000);
  });
});

describe("resolveSlugSelection", () => {
  it("prefers --slug over positional slug", () => {
    expect(resolveSlugSelection("arg-id", "opt-id")).toBe("opt-id");
  });

  it("uses positional slug when --slug is omitted", () => {
    expect(resolveSlugSelection("arg-id", undefined)).toBe("arg-id");
  });

  it("returns undefined when neither source provides slug", () => {
    expect(resolveSlugSelection(undefined, undefined)).toBeUndefined();
  });
});

describe("buildDaemonForkStdio", () => {
  it("includes required IPC channel for fork", () => {
    expect(buildDaemonForkStdio(7)).toEqual(["ignore", 7, 7, "ipc"]);
  });
});

describe("buildBridgeForkStdio", () => {
  it("includes required IPC channel for fork", () => {
    expect(buildBridgeForkStdio(8)).toEqual(["ignore", 8, 8, "ipc"]);
  });
});

describe("parsePositiveIntegerOption", () => {
  it("parses valid positive integers", () => {
    expect(parsePositiveIntegerOption("30", "--timeout")).toBe(30);
  });

  it("throws for zero or negative values", () => {
    expect(() => parsePositiveIntegerOption("0", "--timeout")).toThrow(
      "--timeout must be a positive integer",
    );
    expect(() => parsePositiveIntegerOption("-1", "--timeout")).toThrow(
      "--timeout must be a positive integer",
    );
  });

  it("throws for non-integer values", () => {
    expect(() => parsePositiveIntegerOption("abc", "--timeout")).toThrow(
      "--timeout must be a positive integer",
    );
  });
});

describe("parseBridgeMode", () => {
  it("accepts supported bridge modes", () => {
    expect(parseBridgeMode("openclaw")).toBe("openclaw");
    expect(parseBridgeMode("none")).toBe("none");
    expect(parseBridgeMode("OPENCLAW")).toBe("openclaw");
  });

  it("throws for unsupported bridge modes", () => {
    expect(() => parseBridgeMode("claude-code")).toThrow("--bridge must be one of");
  });
});

describe("messageContainsPong", () => {
  it("matches exact pong text (trimmed, case-insensitive)", () => {
    expect(
      messageContainsPong({
        msg: {
          type: "text",
          data: "  PoNg  ",
        },
      }),
    ).toBe(true);
  });

  it("returns false for non-text or other values", () => {
    expect(messageContainsPong({ msg: { type: "text", data: "ping" } })).toBe(false);
    expect(messageContainsPong({ msg: { type: "html", data: "pong" } })).toBe(false);
    expect(messageContainsPong(null)).toBe(false);
  });
});

describe("pickReusableSession", () => {
  const now = Date.UTC(2026, 1, 28, 0, 0, 0);

  function makePub(slug: string, session: Pub["session"], createdAt: number): Pub {
    return {
      slug,
      isPublic: false,
      createdAt,
      updatedAt: createdAt,
      session,
    };
  }

  it("returns the only pub with an active session", () => {
    const result = pickReusableSession(
      [
        makePub(
          "abc",
          { status: "active", hasConnection: false, expiresAt: now + 60_000 },
          now - 1_000,
        ),
      ],
      now,
    );
    expect(result?.slug).toBe("abc");
  });

  it("returns most recent pub with active session when multiple exist", () => {
    const result = pickReusableSession(
      [
        makePub(
          "abc",
          { status: "active", hasConnection: false, expiresAt: now + 60_000 },
          now - 2_000,
        ),
        makePub(
          "def",
          { status: "active", hasConnection: false, expiresAt: now + 60_000 },
          now - 1_000,
        ),
      ],
      now,
    );
    expect(result?.slug).toBe("def");
  });

  it("returns null when only closed or expired sessions exist", () => {
    const result = pickReusableSession(
      [
        makePub(
          "closed",
          { status: "closed", hasConnection: false, expiresAt: now + 60_000 },
          now - 2_000,
        ),
        makePub(
          "expired",
          { status: "active", hasConnection: false, expiresAt: now - 1 },
          now - 2_000,
        ),
      ],
      now,
    );
    expect(result).toBeNull();
  });

  it("returns null when no pubs have sessions", () => {
    const result = pickReusableSession([makePub("nosession", null, now - 1_000)], now);
    expect(result).toBeNull();
  });
});

describe("shouldRestartDaemonForCliUpgrade", () => {
  it("restarts when daemon version is missing", () => {
    expect(shouldRestartDaemonForCliUpgrade(undefined, CLI_VERSION)).toBe(true);
    expect(shouldRestartDaemonForCliUpgrade("", CLI_VERSION)).toBe(true);
  });

  it("does not restart when versions match", () => {
    expect(shouldRestartDaemonForCliUpgrade(CLI_VERSION, CLI_VERSION)).toBe(false);
  });

  it("restarts when versions differ", () => {
    expect(shouldRestartDaemonForCliUpgrade("0.0.0", CLI_VERSION)).toBe(true);
  });
});
