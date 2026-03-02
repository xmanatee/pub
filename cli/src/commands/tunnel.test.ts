import { describe, expect, it } from "vitest";
import { SUPPORTED_KEYS } from "./configure.js";
import {
  buildDaemonForkStdio,
  getFollowReadDelayMs,
  messageContainsPong,
  parseBridgeMode,
  parsePositiveIntegerOption,
  resolveBridgeMode,
} from "./tunnel-helpers.js";

describe("SUPPORTED_KEYS", () => {
  it("does not include bridge.mode", () => {
    expect(SUPPORTED_KEYS).not.toContain("bridge.mode");
  });
});

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

describe("buildDaemonForkStdio", () => {
  it("includes required IPC channel for fork", () => {
    expect(buildDaemonForkStdio(7)).toEqual(["ignore", 7, 7, "ipc"]);
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

describe("resolveBridgeMode", () => {
  it("defaults to openclaw in background mode", () => {
    expect(resolveBridgeMode({})).toBe("openclaw");
    expect(resolveBridgeMode({ foreground: false })).toBe("openclaw");
  });

  it("defaults to none in foreground mode", () => {
    expect(resolveBridgeMode({ foreground: true })).toBe("none");
  });

  it("allows explicit --bridge openclaw in background mode", () => {
    expect(resolveBridgeMode({ bridge: "openclaw" })).toBe("openclaw");
  });

  it("allows explicit --bridge none in foreground mode", () => {
    expect(resolveBridgeMode({ bridge: "none", foreground: true })).toBe("none");
  });

  it("allows --bridge none in background mode", () => {
    expect(resolveBridgeMode({ bridge: "none" })).toBe("none");
    expect(resolveBridgeMode({ bridge: "none", foreground: false })).toBe("none");
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
