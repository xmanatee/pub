import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_BASE_URL,
  getApiClientSettings,
  getConfigDir,
  getResolvedSettingValue,
  readPubConfig,
  resolveConfigLocation,
  resolvePubSettings,
  writePubConfig,
} from "./index.js";

describe("config", () => {
  let tmpDir: string;
  const originalEnv = {
    HOME: process.env.HOME,
    OPENCLAW_HOME: process.env.OPENCLAW_HOME,
    PUB_CONFIG_DIR: process.env.PUB_CONFIG_DIR,
    PUB_API_KEY: process.env.PUB_API_KEY,
    PUB_BASE_URL: process.env.PUB_BASE_URL,
    CLAUDE_CODE_PATH: process.env.CLAUDE_CODE_PATH,
  };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pub-config-test-"));
    process.env.HOME = tmpDir;
    delete process.env.OPENCLAW_HOME;
    delete process.env.PUB_CONFIG_DIR;
    delete process.env.PUB_API_KEY;
    delete process.env.PUB_BASE_URL;
    delete process.env.CLAUDE_CODE_PATH;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    process.env.HOME = originalEnv.HOME;
    process.env.OPENCLAW_HOME = originalEnv.OPENCLAW_HOME;
    process.env.PUB_CONFIG_DIR = originalEnv.PUB_CONFIG_DIR;
    process.env.PUB_API_KEY = originalEnv.PUB_API_KEY;
    process.env.PUB_BASE_URL = originalEnv.PUB_BASE_URL;
    process.env.CLAUDE_CODE_PATH = originalEnv.CLAUDE_CODE_PATH;
    for (const key of Object.keys(originalEnv) as Array<keyof typeof originalEnv>) {
      if (!originalEnv[key]) delete process.env[key];
    }
  });

  function makeHomeConfigDir(): string {
    const dir = path.join(tmpDir, ".config", "pub");
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  function makeOpenClawConfigDir(): string {
    process.env.OPENCLAW_HOME = path.join(tmpDir, "openclaw-home");
    const dir = path.join(process.env.OPENCLAW_HOME, ".openclaw", "pub");
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  it("returns null when no config file exists in the selected config dir", () => {
    makeHomeConfigDir();
    expect(readPubConfig()).toBeNull();
  });

  it("saves and loads config in ~/.config/pub", () => {
    makeHomeConfigDir();
    writePubConfig({ core: { apiKey: "pub_test" } });
    expect(readPubConfig()).toEqual({ core: { apiKey: "pub_test" } });
  });

  it("normalizes legacy top-level apiKey into core.apiKey", () => {
    const dir = makeHomeConfigDir();
    fs.writeFileSync(
      path.join(dir, "config.json"),
      `${JSON.stringify({ apiKey: "pub_legacy", bridge: { mode: "claude-code" } }, null, 2)}\n`,
      "utf-8",
    );

    expect(readPubConfig()).toEqual({
      core: { apiKey: "pub_legacy" },
      bridge: { mode: "claude-code" },
    });
  });

  it("uses default base URL when no env var is set", () => {
    makeHomeConfigDir();
    writePubConfig({ core: { apiKey: "pub_test" } });
    const settings = getApiClientSettings();
    expect(settings.apiKey).toBe("pub_test");
    expect(settings.baseUrl).toBe(DEFAULT_BASE_URL);
  });

  it("prefers PUB_API_KEY env var over saved config", () => {
    makeHomeConfigDir();
    writePubConfig({
      core: { apiKey: "pub_saved" },
      bridge: { mode: "claude-code" },
    });
    process.env.PUB_API_KEY = "pub_env";

    const settings = getApiClientSettings();
    expect(settings.apiKey).toBe("pub_env");
  });

  it("resolvePubSettings does not require an api key", () => {
    makeHomeConfigDir();
    writePubConfig({ bridge: { mode: "claude-code" } });
    const resolved = resolvePubSettings();
    expect(resolved.core.apiKey).toBeNull();
    expect(resolved.rawConfig.bridge?.mode).toBe("claude-code");
  });

  it("getApiClientSettings throws when api key is missing", () => {
    makeHomeConfigDir();
    writePubConfig({ bridge: { mode: "claude-code" } });
    expect(() => getApiClientSettings()).toThrow("Missing apiKey");
  });

  it("tracks source per config key", () => {
    makeHomeConfigDir();
    writePubConfig({
      core: { apiKey: "pub_saved" },
      bridge: { mode: "claude-code", claudeCodePath: "/config/claude" },
    });
    process.env.PUB_BASE_URL = "https://custom.convex.site";
    process.env.CLAUDE_CODE_PATH = "/env/claude";

    const resolved = resolvePubSettings();
    expect(resolved.core.apiKey?.source).toBe("config");
    expect(resolved.core.baseUrl.source).toBe("env");
    expect(getResolvedSettingValue(resolved, "bridge.mode")?.source).toBe("config");
    expect(resolved.rawConfig.bridge?.mode).toBe("claude-code");
    expect(resolved.rawConfig.bridge?.claudeCodePath).toBe("/config/claude");
  });

  it("uses PUB_CONFIG_DIR when set and it exists", () => {
    const dir = path.join(tmpDir, "explicit-blue");
    fs.mkdirSync(dir, { recursive: true });
    process.env.PUB_CONFIG_DIR = dir;

    expect(getConfigDir()).toBe(dir);
  });

  it("uses OPENCLAW_HOME/.openclaw/pub when it is the only existing location", () => {
    const dir = makeOpenClawConfigDir();
    expect(getConfigDir()).toBe(dir);
  });

  it("uses ~/.config/pub when it is the only existing location", () => {
    const dir = makeHomeConfigDir();
    expect(getConfigDir()).toBe(dir);
  });

  it("throws when two config directories exist", () => {
    makeOpenClawConfigDir();
    makeHomeConfigDir();
    expect(() => resolveConfigLocation()).toThrow("Ambiguous Pub config directories detected.");
  });

  it("throws when no config directory exists", () => {
    expect(() => resolveConfigLocation()).toThrow("No Pub config directory found.");
  });

  it("readPubConfig returns null when no config directory exists", () => {
    expect(readPubConfig()).toBeNull();
  });
});
