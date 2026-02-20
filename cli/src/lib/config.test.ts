import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { loadConfig, saveConfig, getConfig } from "./config.js";

describe("config", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "publish-test-"));
    delete process.env.PUBLISH_API_KEY;
    delete process.env.PUBLISH_URL;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.PUBLISH_API_KEY;
    delete process.env.PUBLISH_URL;
  });

  it("returns null when no config file exists", () => {
    expect(loadConfig(tmpDir)).toBeNull();
  });

  it("saves and loads config", () => {
    const config = { apiKey: "pub_test", baseUrl: "https://test.convex.site" };
    saveConfig(config, tmpDir);
    expect(loadConfig(tmpDir)).toEqual(config);
  });

  it("prefers environment variables over saved config", () => {
    saveConfig(
      { apiKey: "pub_saved", baseUrl: "https://saved.convex.site" },
      tmpDir,
    );
    process.env.PUBLISH_API_KEY = "pub_env";
    process.env.PUBLISH_URL = "https://env.convex.site";

    const config = getConfig(tmpDir);
    expect(config.apiKey).toBe("pub_env");
    expect(config.baseUrl).toBe("https://env.convex.site");
  });

  it("throws when no config available", () => {
    expect(() => getConfig(tmpDir)).toThrow("Not configured");
  });

  it("uses env key with saved URL", () => {
    saveConfig(
      { apiKey: "pub_saved", baseUrl: "https://saved.convex.site" },
      tmpDir,
    );
    process.env.PUBLISH_API_KEY = "pub_env";

    const config = getConfig(tmpDir);
    expect(config.apiKey).toBe("pub_env");
    expect(config.baseUrl).toBe("https://saved.convex.site");
  });
});
