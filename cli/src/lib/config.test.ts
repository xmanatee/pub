import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_BASE_URL, getConfig, loadConfig, saveConfig } from "./config.js";

describe("config", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "publish-test-"));
    delete process.env.PUBBLUE_API_KEY;
    delete process.env.PUBBLUE_URL;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.PUBBLUE_API_KEY;
    delete process.env.PUBBLUE_URL;
  });

  it("returns null when no config file exists", () => {
    expect(loadConfig(tmpDir)).toBeNull();
  });

  it("saves and loads config with apiKey only", () => {
    saveConfig({ apiKey: "pub_test" }, tmpDir);
    expect(loadConfig(tmpDir)).toEqual({ apiKey: "pub_test" });
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
    expect(loadConfig(tmpDir)).toEqual({
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
});
