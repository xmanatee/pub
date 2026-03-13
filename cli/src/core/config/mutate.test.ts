import { describe, expect, it } from "vitest";
import type { PubBridgeConfig, PubConfig, PubTelegramConfig } from "./index.js";
import {
  compactPubConfig,
  parseConfigAssignment,
  setPubConfigValue,
  SUPPORTED_CONFIG_KEYS,
  unsetPubConfigValue,
} from "./index.js";

describe("parseConfigAssignment", () => {
  it("splits on first = sign", () => {
    expect(parseConfigAssignment("openclaw.path=/usr/bin/oc")).toEqual({
      key: "openclaw.path",
      value: "/usr/bin/oc",
    });
  });

  it("handles values containing =", () => {
    expect(parseConfigAssignment("baseUrl=https://example.com?foo=bar")).toEqual({
      key: "baseUrl",
      value: "https://example.com?foo=bar",
    });
  });

  it("trims key and value", () => {
    expect(parseConfigAssignment("  key  =  val  ")).toEqual({ key: "key", value: "val" });
  });

  it("throws on malformed input", () => {
    expect(() => parseConfigAssignment("noEquals")).toThrow("Invalid --set entry");
    expect(() => parseConfigAssignment("key=")).toThrow("Invalid --set entry");
    expect(() => parseConfigAssignment("=value")).toThrow("Invalid --set entry");
  });
});

describe("setPubConfigValue", () => {
  function makeBridge(): PubBridgeConfig {
    return {};
  }

  function makeTelegram(): PubTelegramConfig {
    return {};
  }

  function makeConfig(): PubConfig {
    return {
      bridge: makeBridge(),
      telegram: makeTelegram(),
    };
  }

  it("sets apiKey under core", () => {
    const config: PubConfig = {};
    setPubConfigValue(config, "apiKey", "pub_test");
    expect(config.core?.apiKey).toBe("pub_test");
  });

  it("sets openclaw string keys", () => {
    const stringKeys: Array<{ key: string; field: keyof PubBridgeConfig }> = [
      { key: "bridge.cwd", field: "bridgeCwd" },
      { key: "bridge.attachmentDir", field: "attachmentDir" },
      { key: "openclaw.path", field: "openclawPath" },
      { key: "openclaw.stateDir", field: "openclawStateDir" },
      { key: "openclaw.sessionId", field: "sessionId" },
      { key: "openclaw.threadId", field: "threadId" },
    ];

    for (const { key, field } of stringKeys) {
      const config = makeConfig();
      setPubConfigValue(config, key, "/test/value");
      expect(config.bridge?.[field]).toBe("/test/value");
    }
  });

  it("sets integer bridge keys with parsing", () => {
    const config = makeConfig();
    setPubConfigValue(config, "bridge.canvasReminderEvery", "123");
    expect(config.bridge?.canvasReminderEvery).toBe(123);
  });

  it("sets boolean bridge keys with parsing", () => {
    const config = makeConfig();
    setPubConfigValue(config, "bridge.verbose", "true");
    expect(config.bridge?.verbose).toBe(true);
  });

  it("sets bridge.mode", () => {
    const config = makeConfig();
    setPubConfigValue(config, "bridge.mode", "claude-sdk");
    expect(config.bridge?.mode).toBe("claude-sdk");
  });

  it("rejects unknown and derived keys", () => {
    const config = makeConfig();
    expect(() => setPubConfigValue(config, "unknown.key", "v")).toThrow("Unknown config key");
    expect(() => setPubConfigValue(config, "telegram.botUsername", "bot")).toThrow(
      "cannot be set directly",
    );
  });
});

describe("unsetPubConfigValue", () => {
  it("removes bridge keys", () => {
    const config: PubConfig = {
      bridge: {
        openclawPath: "/path",
        sessionId: "s1",
        threadId: "t1",
      },
    };

    unsetPubConfigValue(config, "openclaw.path");
    unsetPubConfigValue(config, "openclaw.sessionId");

    expect(config.bridge?.openclawPath).toBeUndefined();
    expect(config.bridge?.sessionId).toBeUndefined();
  });

  it("cascades telegram.botToken unset to derived telegram fields", () => {
    const config: PubConfig = {
      telegram: {
        botToken: "token",
        botUsername: "mybot",
        hasMainWebApp: true,
      },
    };

    unsetPubConfigValue(config, "telegram.botToken");
    expect(config.telegram).toBeUndefined();
  });
});

describe("compactPubConfig", () => {
  it("removes empty sections", () => {
    const config: PubConfig = {
      core: {},
      bridge: {},
      telegram: {},
    };

    expect(compactPubConfig(config)).toEqual({});
  });
});

describe("SUPPORTED_CONFIG_KEYS", () => {
  it("lists all mutable config keys", () => {
    expect(SUPPORTED_CONFIG_KEYS).toHaveLength(28);
    expect(SUPPORTED_CONFIG_KEYS).toContain("apiKey");
    expect(SUPPORTED_CONFIG_KEYS).toContain("baseUrl");
    expect(SUPPORTED_CONFIG_KEYS).toContain("telemetry");
    expect(SUPPORTED_CONFIG_KEYS).toContain("sentryDsn");
    expect(SUPPORTED_CONFIG_KEYS).toContain("bridge.verbose");
    expect(SUPPORTED_CONFIG_KEYS).toContain("command.agent.defaultProfile");
    expect(SUPPORTED_CONFIG_KEYS).toContain("claude-sdk.commandModelFast");
    expect(SUPPORTED_CONFIG_KEYS).toContain("telegram.botToken");
  });
});
