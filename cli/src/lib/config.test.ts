import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_BASE_URL, getConfig, getConfigDir, readConfig, saveConfig } from "./config.js";

describe("config", () => {
  let tmpDir: string;
  const originalPubblueConfigDir = process.env.PUBBLUE_CONFIG_DIR;
  const originalOpenClawStateDir = process.env.OPENCLAW_STATE_DIR;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pubblue-test-"));
    delete process.env.PUBBLUE_API_KEY;
    delete process.env.PUBBLUE_URL;
    delete process.env.PUBBLUE_CONFIG_DIR;
    delete process.env.OPENCLAW_STATE_DIR;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.PUBBLUE_API_KEY;
    delete process.env.PUBBLUE_URL;
    process.env.PUBBLUE_CONFIG_DIR = originalPubblueConfigDir;
    process.env.OPENCLAW_STATE_DIR = originalOpenClawStateDir;
    if (!originalPubblueConfigDir) delete process.env.PUBBLUE_CONFIG_DIR;
    if (!originalOpenClawStateDir) delete process.env.OPENCLAW_STATE_DIR;
  });

  it("returns null when no config file exists", () => {
    expect(readConfig(tmpDir)).toBeNull();
  });

  it("saves and loads config with apiKey only", () => {
    saveConfig({ apiKey: "pub_test" }, tmpDir);
    expect(readConfig(tmpDir)).toEqual({ apiKey: "pub_test" });
  });

  it("saves and loads bridge config", () => {
    saveConfig(
      {
        apiKey: "pub_test",
        bridge: {
          sessionId: "session-123",
          deliver: true,
        },
      },
      tmpDir,
    );
    expect(readConfig(tmpDir)).toEqual({
      apiKey: "pub_test",
      bridge: {
        sessionId: "session-123",
        deliver: true,
      },
    });
  });

  it("uses default base URL when no env var is set", () => {
    saveConfig({ apiKey: "pub_test" }, tmpDir);
    const config = getConfig(tmpDir);
    expect(config.apiKey).toBe("pub_test");
    expect(config.baseUrl).toBe(DEFAULT_BASE_URL);
    expect(config.bridge).toBeUndefined();
  });

  it("PUBBLUE_URL env var overrides the default base URL", () => {
    saveConfig({ apiKey: "pub_saved" }, tmpDir);
    process.env.PUBBLUE_URL = "https://custom.convex.site";

    const config = getConfig(tmpDir);
    expect(config.apiKey).toBe("pub_saved");
    expect(config.baseUrl).toBe("https://custom.convex.site");
  });

  it("prefers PUBBLUE_API_KEY env var over saved config", () => {
    saveConfig(
      {
        apiKey: "pub_saved",
        bridge: { threadId: "thread-a" },
      },
      tmpDir,
    );
    process.env.PUBBLUE_API_KEY = "pub_env";

    const config = getConfig(tmpDir);
    expect(config.apiKey).toBe("pub_env");
    expect(config.baseUrl).toBe(DEFAULT_BASE_URL);
    expect(config.bridge).toEqual({ threadId: "thread-a" });
  });

  it("throws when no config available", () => {
    expect(() => getConfig(tmpDir)).toThrow("Not configured");
  });

  describe("getConfigDir", () => {
    it("uses PUBBLUE_CONFIG_DIR when set", () => {
      process.env.PUBBLUE_CONFIG_DIR = "/custom/config";
      expect(getConfigDir()).toBe("/custom/config");
    });

    it("falls back to homeDir/.openclaw/pubblue when no PUBBLUE_CONFIG_DIR is set", () => {
      expect(getConfigDir("/home/test")).toBe(path.join("/home/test", ".openclaw", "pubblue"));
    });

    it("falls back to OPENCLAW_STATE_DIR/pubblue when no args are provided", () => {
      process.env.OPENCLAW_STATE_DIR = "/tmp/openclaw-state";
      expect(getConfigDir()).toBe(path.join("/tmp/openclaw-state", "pubblue"));
    });

    it("ignores blank PUBBLUE_CONFIG_DIR", () => {
      process.env.PUBBLUE_CONFIG_DIR = "   ";
      expect(getConfigDir("/home/test")).toBe(path.join("/home/test", ".openclaw", "pubblue"));
    });
  });
});
