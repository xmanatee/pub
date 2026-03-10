import { beforeEach, describe, expect, it, vi } from "vitest";
import { isClaudeCodeAvailableInEnv } from "../lib/live-bridge-claude-code.js";
import { isClaudeSdkAvailableInEnv } from "../lib/live-bridge-claude-sdk.js";
import { isOpenClawAvailable } from "../lib/live-bridge-openclaw.js";
import { parseBridgeMode, validateBridgeSelection } from "../lib/live-runtime/bridge-runtime.js";
import { getFollowReadDelayMs, messageContainsPong } from "../lib/live-runtime/command-utils.js";
import { buildDaemonSpawnStdio } from "../lib/live-runtime/daemon-process.js";
import { parsePositiveInteger } from "../lib/number.js";
import { SUPPORTED_KEYS } from "./config/schema.js";

vi.mock("../lib/live-bridge-openclaw.js", () => ({
  isOpenClawAvailable: vi.fn(() => false),
  runOpenClawBridgeStartupProbe: vi.fn(),
}));
vi.mock("../lib/live-bridge-claude-code.js", () => ({
  isClaudeCodeAvailableInEnv: vi.fn(() => false),
  runClaudeCodeBridgeStartupProbe: vi.fn(),
}));
vi.mock("../lib/live-bridge-claude-sdk.js", () => ({
  isClaudeSdkAvailableInEnv: vi.fn(() => false),
  isClaudeSdkImportable: vi.fn(async () => false),
  runClaudeSdkBridgeStartupProbe: vi.fn(),
}));

describe("SUPPORTED_KEYS", () => {
  it("includes bridge.mode", () => {
    expect(SUPPORTED_KEYS).toContain("bridge.mode");
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

describe("buildDaemonSpawnStdio", () => {
  it("returns stdio config for spawn (no IPC channel)", () => {
    expect(buildDaemonSpawnStdio(7)).toEqual(["ignore", 7, 7]);
  });
});

describe("parsePositiveInteger", () => {
  it("parses valid positive integers", () => {
    expect(parsePositiveInteger("30", "--timeout")).toBe(30);
  });

  it("throws for zero or negative values", () => {
    expect(() => parsePositiveInteger("0", "--timeout")).toThrow(
      "--timeout must be a positive integer",
    );
    expect(() => parsePositiveInteger("-1", "--timeout")).toThrow(
      "--timeout must be a positive integer",
    );
  });

  it("throws for non-integer values", () => {
    expect(() => parsePositiveInteger("abc", "--timeout")).toThrow(
      "--timeout must be a positive integer",
    );
  });
});

describe("parseBridgeMode", () => {
  it("accepts supported bridge modes", () => {
    expect(parseBridgeMode("openclaw")).toBe("openclaw");
    expect(parseBridgeMode("claude-code")).toBe("claude-code");
    expect(parseBridgeMode("claude-sdk")).toBe("claude-sdk");
    expect(parseBridgeMode("OPENCLAW")).toBe("openclaw");
    expect(parseBridgeMode("CLAUDE-CODE")).toBe("claude-code");
    expect(parseBridgeMode("CLAUDE-SDK")).toBe("claude-sdk");
  });

  it("throws for unsupported bridge modes", () => {
    expect(() => parseBridgeMode("invalid")).toThrow("--bridge must be one of");
    expect(() => parseBridgeMode("none")).toThrow("--bridge must be one of");
  });
});

describe("validateBridgeSelection", () => {
  beforeEach(() => {
    vi.mocked(isOpenClawAvailable).mockReturnValue(false);
    vi.mocked(isClaudeCodeAvailableInEnv).mockReturnValue(false);
    vi.mocked(isClaudeSdkAvailableInEnv).mockReturnValue(false);
  });

  it("accepts configured modes when the selected bridge is available", () => {
    vi.mocked(isOpenClawAvailable).mockReturnValue(true);
    vi.mocked(isClaudeCodeAvailableInEnv).mockReturnValue(true);
    vi.mocked(isClaudeSdkAvailableInEnv).mockReturnValue(true);
    expect(validateBridgeSelection("openclaw", "config").mode).toBe("openclaw");
    expect(validateBridgeSelection("claude-code", "explicit").mode).toBe("claude-code");
    expect(validateBridgeSelection("claude-sdk", "config").mode).toBe("claude-sdk");
  });

  it("throws when the selected bridge is unavailable", () => {
    expect(() => validateBridgeSelection("openclaw", "config")).toThrow(
      'Configured bridge "openclaw" is unavailable',
    );
    expect(() => validateBridgeSelection("openclaw", "explicit")).toThrow(
      'Requested bridge "openclaw" is unavailable',
    );
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
