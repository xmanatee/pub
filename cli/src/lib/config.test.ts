import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_BASE_URL,
  getConfig,
  getConfigDir,
  getRequiredConfig,
  readConfig,
  resolveConfig,
  resolveConfigLocation,
  saveConfig,
} from "./config.js";

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
    const dir = path.join(tmpDir, ".configs", "pub");
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
    expect(readConfig()).toBeNull();
  });

  it("saves and loads config in ~/.configs/pub", () => {
    makeHomeConfigDir();
    saveConfig({ apiKey: "pub_test" });
    expect(readConfig()).toEqual({ apiKey: "pub_test" });
  });

  it("uses default base URL when no env var is set", () => {
    makeHomeConfigDir();
    saveConfig({ apiKey: "pub_test" });
    const config = getRequiredConfig();
    expect(config.apiKey).toBe("pub_test");
    expect(config.baseUrl).toBe(DEFAULT_BASE_URL);
  });

  it("prefers PUB_API_KEY env var over saved config", () => {
    makeHomeConfigDir();
    saveConfig({
      apiKey: "pub_saved",
      bridge: { mode: "claude-code", threadId: "thread-a" },
    });
    process.env.PUB_API_KEY = "pub_env";

    const config = getRequiredConfig();
    expect(config.apiKey).toBe("pub_env");
    expect(config.bridge).toEqual({ mode: "claude-code", threadId: "thread-a" });
  });

  it("getConfig does not require an api key", () => {
    makeHomeConfigDir();
    saveConfig({ bridge: { mode: "claude-code" } });
    const config = getConfig();
    expect(config.apiKey).toBeNull();
    expect(config.bridge.mode).toBe("claude-code");
  });

  it("getRequiredConfig throws when api key is missing", () => {
    makeHomeConfigDir();
    saveConfig({ bridge: { mode: "claude-code" } });
    expect(() => getRequiredConfig()).toThrow("Missing PUB_API_KEY");
  });

  it("shows env vs config sources in resolved config", () => {
    makeHomeConfigDir();
    saveConfig({
      apiKey: "pub_saved",
      bridge: { mode: "claude-code", claudeCodePath: "/config/claude" },
    });
    process.env.PUB_BASE_URL = "https://custom.convex.site";
    process.env.CLAUDE_CODE_PATH = "/env/claude";

    const resolved = resolveConfig();
    expect(resolved.apiKey?.source).toBe("config");
    expect(resolved.baseUrl.source).toBe("env");
    expect(resolved.bridge.mode).toBe("claude-code");
    expect(resolved.bridge.claudeCodePath).toBe("/env/claude");
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

  it("uses ~/.configs/pub when it is the only existing location", () => {
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

});
