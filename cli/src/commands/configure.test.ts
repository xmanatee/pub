import { describe, expect, it } from "vitest";
import type { BridgeConfig, TelegramConfig } from "../lib/config.js";
import {
  applyConfigSet,
  applyConfigUnset,
  parseBooleanValue,
  parsePositiveInteger,
  parseSetInput,
  SUPPORTED_KEYS,
} from "./configure/schema.js";

describe("parseSetInput", () => {
  it("splits on first = sign", () => {
    expect(parseSetInput("openclaw.path=/usr/bin/oc")).toEqual({
      key: "openclaw.path",
      value: "/usr/bin/oc",
    });
  });

  it("handles values containing =", () => {
    expect(parseSetInput("claude-code.appendSystemPrompt=a=b=c")).toEqual({
      key: "claude-code.appendSystemPrompt",
      value: "a=b=c",
    });
  });

  it("trims key and value", () => {
    expect(parseSetInput("  key  =  val  ")).toEqual({ key: "key", value: "val" });
  });

  it("throws on missing =", () => {
    expect(() => parseSetInput("noEquals")).toThrow("Invalid --set entry");
  });

  it("throws on empty value", () => {
    expect(() => parseSetInput("key=")).toThrow("Invalid --set entry");
  });

  it("throws on empty key", () => {
    expect(() => parseSetInput("=value")).toThrow("Invalid --set entry");
  });
});

describe("parseBooleanValue", () => {
  const truthy = ["1", "true", "yes", "on", "TRUE", "Yes", " ON "];
  const falsy = ["0", "false", "no", "off", "FALSE", "No", " OFF "];

  for (const v of truthy) {
    it(`parses "${v}" as true`, () => {
      expect(parseBooleanValue(v, "test")).toBe(true);
    });
  }

  for (const v of falsy) {
    it(`parses "${v}" as false`, () => {
      expect(parseBooleanValue(v, "test")).toBe(false);
    });
  }

  it("throws on invalid value", () => {
    expect(() => parseBooleanValue("maybe", "test")).toThrow("Invalid boolean value");
  });
});

describe("parsePositiveInteger", () => {
  it("parses a positive integer", () => {
    expect(parsePositiveInteger("42", "test")).toBe(42);
  });

  it("throws on zero", () => {
    expect(() => parsePositiveInteger("0", "test")).toThrow("must be a positive integer");
  });

  it("throws on negative", () => {
    expect(() => parsePositiveInteger("-5", "test")).toThrow("must be a positive integer");
  });

  it("throws on non-numeric", () => {
    expect(() => parsePositiveInteger("abc", "test")).toThrow("must be a positive integer");
  });

  it("truncates floats to integer", () => {
    expect(parsePositiveInteger("3.14", "test")).toBe(3);
  });
});

describe("applyConfigSet", () => {
  function makeBridge(): BridgeConfig {
    return {};
  }
  function makeTelegram(): TelegramConfig {
    return {};
  }

  it("sets all openclaw string keys", () => {
    const stringKeys: Array<{ key: string; field: keyof BridgeConfig }> = [
      { key: "openclaw.path", field: "openclawPath" },
      { key: "openclaw.stateDir", field: "openclawStateDir" },
      { key: "openclaw.workspace", field: "openclawWorkspace" },
      { key: "openclaw.sessionId", field: "sessionId" },
      { key: "openclaw.threadId", field: "threadId" },
      { key: "openclaw.deliverChannel", field: "deliverChannel" },
      { key: "openclaw.replyTo", field: "replyTo" },
      { key: "openclaw.attachmentDir", field: "attachmentDir" },
    ];

    for (const { key, field } of stringKeys) {
      const bridge = makeBridge();
      const telegram = makeTelegram();
      applyConfigSet(bridge, telegram, key, "/test/value");
      expect(bridge[field]).toBe("/test/value");
    }
  });

  it("sets openclaw integer keys with parsing", () => {
    const intKeys: Array<{ key: string; field: keyof BridgeConfig }> = [
      { key: "openclaw.canvasReminderEvery", field: "canvasReminderEvery" },
      { key: "openclaw.deliverTimeoutMs", field: "deliverTimeoutMs" },
      { key: "openclaw.attachmentMaxBytes", field: "attachmentMaxBytes" },
    ];

    for (const { key, field } of intKeys) {
      const bridge = makeBridge();
      const telegram = makeTelegram();
      applyConfigSet(bridge, telegram, key, "123");
      expect(bridge[field]).toBe(123);
    }
  });

  it("sets openclaw.deliver as boolean", () => {
    const bridge = makeBridge();
    const telegram = makeTelegram();
    applyConfigSet(bridge, telegram, "openclaw.deliver", "true");
    expect(bridge.deliver).toBe(true);
  });

  it("sets all claude-code string keys", () => {
    const ccKeys: Array<{ key: string; field: keyof BridgeConfig }> = [
      { key: "claude-code.path", field: "claudeCodePath" },
      { key: "claude-code.model", field: "claudeCodeModel" },
      { key: "claude-code.allowedTools", field: "claudeCodeAllowedTools" },
      { key: "claude-code.appendSystemPrompt", field: "claudeCodeAppendSystemPrompt" },
      { key: "claude-code.cwd", field: "claudeCodeCwd" },
    ];

    for (const { key, field } of ccKeys) {
      const bridge = makeBridge();
      const telegram = makeTelegram();
      applyConfigSet(bridge, telegram, key, "/cc/value");
      expect(bridge[field]).toBe("/cc/value");
    }
  });

  it("sets claude-code.maxTurns as integer", () => {
    const bridge = makeBridge();
    const telegram = makeTelegram();
    applyConfigSet(bridge, telegram, "claude-code.maxTurns", "10");
    expect(bridge.claudeCodeMaxTurns).toBe(10);
  });

  it("sets telegram.botToken", () => {
    const bridge = makeBridge();
    const telegram = makeTelegram();
    applyConfigSet(bridge, telegram, "telegram.botToken", "12345:ABC");
    expect(telegram.botToken).toBe("12345:ABC");
  });

  it("throws on unknown key", () => {
    expect(() => applyConfigSet(makeBridge(), makeTelegram(), "unknown.key", "v")).toThrow(
      "Unknown config key",
    );
  });
});

describe("applyConfigUnset", () => {
  it("removes openclaw keys", () => {
    const bridge: BridgeConfig = {
      openclawPath: "/path",
      sessionId: "s1",
      threadId: "t1",
    };
    const telegram: TelegramConfig = {};

    applyConfigUnset(bridge, telegram, "openclaw.path");
    expect(bridge.openclawPath).toBeUndefined();

    applyConfigUnset(bridge, telegram, "openclaw.sessionId");
    expect(bridge.sessionId).toBeUndefined();
  });

  it("removes claude-code keys", () => {
    const bridge: BridgeConfig = {
      claudeCodePath: "/cc",
      claudeCodeModel: "sonnet",
      claudeCodeMaxTurns: 5,
    };
    const telegram: TelegramConfig = {};

    applyConfigUnset(bridge, telegram, "claude-code.path");
    expect(bridge.claudeCodePath).toBeUndefined();

    applyConfigUnset(bridge, telegram, "claude-code.maxTurns");
    expect(bridge.claudeCodeMaxTurns).toBeUndefined();
  });

  it("cascades telegram.botToken unset to botUsername and hasMainWebApp", () => {
    const bridge: BridgeConfig = {};
    const telegram: TelegramConfig = {
      botToken: "token",
      botUsername: "mybot",
      hasMainWebApp: true,
    };

    applyConfigUnset(bridge, telegram, "telegram.botToken");
    expect(telegram.botToken).toBeUndefined();
    expect(telegram.botUsername).toBeUndefined();
    expect(telegram.hasMainWebApp).toBeUndefined();
  });

  it("throws on unknown key", () => {
    expect(() => applyConfigUnset({}, {}, "unknown.key")).toThrow("Unknown config key");
  });
});

describe("SUPPORTED_KEYS", () => {
  it("lists all 19 config keys", () => {
    expect(SUPPORTED_KEYS).toHaveLength(19);
  });

  it("every key is handled by applyConfigSet without throwing", () => {
    for (const key of SUPPORTED_KEYS) {
      const bridge: BridgeConfig = {};
      const telegram: TelegramConfig = {};
      const value =
        key.includes("Every") ||
        key.includes("Timeout") ||
        key.includes("Max") ||
        key.includes("maxTurns")
          ? "10"
          : key === "openclaw.deliver"
            ? "true"
            : "test-value";
      expect(() => applyConfigSet(bridge, telegram, key, value)).not.toThrow();
    }
  });

  it("every key is handled by applyConfigUnset without throwing", () => {
    for (const key of SUPPORTED_KEYS) {
      const bridge: BridgeConfig = {};
      const telegram: TelegramConfig = {};
      expect(() => applyConfigUnset(bridge, telegram, key)).not.toThrow();
    }
  });
});
