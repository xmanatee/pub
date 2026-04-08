import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PATH_ENV_VARS } from "../paths.js";
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

const CONFIG_TEST_ENV_VARS = [...PATH_ENV_VARS, "PUB_API_KEY", "PUB_BASE_URL", "CLAUDE_CODE_PATH"];

describe("config", () => {
  let tmpDir: string;
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of CONFIG_TEST_ENV_VARS) savedEnv[key] = process.env[key];
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pub-config-test-"));
    process.env.HOME = tmpDir;
    for (const key of CONFIG_TEST_ENV_VARS) {
      if (key !== "HOME") delete process.env[key];
    }
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    for (const key of CONFIG_TEST_ENV_VARS) {
      if (savedEnv[key] !== undefined) process.env[key] = savedEnv[key];
      else delete process.env[key];
    }
  });

  function makeHomeConfigDir(): string {
    const dir = path.join(tmpDir, ".config", "pub");
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

  it("reads all supported core config fields from the canonical core section", () => {
    const dir = makeHomeConfigDir();
    fs.writeFileSync(
      path.join(dir, "config.json"),
      `${JSON.stringify(
        {
          core: {
            apiKey: "pub_test",
            baseUrl: "https://custom.convex.site",
            telemetry: false,
            sentryDsn: "https://dsn.example/1",
          },
          bridge: { mode: "claude-code" },
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );

    expect(readPubConfig()).toEqual({
      core: {
        apiKey: "pub_test",
        baseUrl: "https://custom.convex.site",
        telemetry: false,
        sentryDsn: "https://dsn.example/1",
      },
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

  it("uses ~/.config/pub by default", () => {
    const dir = makeHomeConfigDir();
    expect(getConfigDir()).toBe(dir);
  });

  it("uses PUB_HOME/config when PUB_HOME is set", () => {
    process.env.PUB_HOME = path.join(tmpDir, "pub-home");
    expect(getConfigDir()).toBe(path.join(process.env.PUB_HOME, "config"));
  });

  it("resolves config location deterministically even before the directory exists", () => {
    const location = resolveConfigLocation();
    expect(location.dir).toBe(path.join(tmpDir, ".config", "pub"));
    expect(location.source).toBe("PUB_CONFIG_HOME");
  });

  it("readPubConfig returns null when no config directory exists", () => {
    expect(readPubConfig()).toBeNull();
  });
});
