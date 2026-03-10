import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildBridgeProcessEnv, buildBridgeSettings } from "./bridge-runtime.js";

describe("bridge-runtime", () => {
  const originalEnv = {
    PUB_CONFIG_DIR: process.env.PUB_CONFIG_DIR,
    PUB_PROJECT_ROOT: process.env.PUB_PROJECT_ROOT,
    PUB_LIVE_DEBUG: process.env.PUB_LIVE_DEBUG,
  };

  afterEach(() => {
    process.env.PUB_CONFIG_DIR = originalEnv.PUB_CONFIG_DIR;
    process.env.PUB_PROJECT_ROOT = originalEnv.PUB_PROJECT_ROOT;
    process.env.PUB_LIVE_DEBUG = originalEnv.PUB_LIVE_DEBUG;
    if (!originalEnv.PUB_CONFIG_DIR) delete process.env.PUB_CONFIG_DIR;
    if (!originalEnv.PUB_PROJECT_ROOT) delete process.env.PUB_PROJECT_ROOT;
    if (!originalEnv.PUB_LIVE_DEBUG) delete process.env.PUB_LIVE_DEBUG;
  });

  it("adds PUB_PROJECT_ROOT when missing", () => {
    delete process.env.PUB_PROJECT_ROOT;

    const env = buildBridgeProcessEnv();
    expect(env.PUB_PROJECT_ROOT).toBe(process.cwd());
  });

  it("does not override an existing PUB_PROJECT_ROOT", () => {
    process.env.PUB_PROJECT_ROOT = "/tmp/existing-project-root";

    const env = buildBridgeProcessEnv();
    expect(env.PUB_PROJECT_ROOT).toBe("/tmp/existing-project-root");
  });

  it("builds concrete runtime defaults for claude bridges", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pub-config-"));
    process.env.PUB_CONFIG_DIR = tempDir;
    process.env.PUB_PROJECT_ROOT = "/tmp/pub-project";

    const bridgeSettings = buildBridgeSettings(
      "claude-code",
      {
        claudeCodePath: "/usr/local/bin/claude",
      },
      buildBridgeProcessEnv(),
    );

    expect(bridgeSettings.bridgeCwd).toBe("/tmp/pub-project");
    expect(bridgeSettings.attachmentDir).toContain("/attachments");
    expect(bridgeSettings.canvasReminderEvery).toBe(10);
    expect(bridgeSettings.commandDefaultTimeoutMs).toBe(15_000);
    expect(bridgeSettings.debug).toBe(false);
  });

  it("uses PUB_LIVE_DEBUG env override for bridge debug", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pub-config-"));
    process.env.PUB_CONFIG_DIR = tempDir;
    process.env.PUB_PROJECT_ROOT = "/tmp/pub-project";
    process.env.PUB_LIVE_DEBUG = "1";

    const bridgeSettings = buildBridgeSettings(
      "claude-code",
      {
        claudeCodePath: "/usr/local/bin/claude",
      },
      buildBridgeProcessEnv(),
    );

    expect(bridgeSettings.debug).toBe(true);
  });

  it("requires explicit OpenClaw workspace in runtime settings", () => {
    expect(() =>
      buildBridgeSettings(
        "openclaw",
        {
          openclawPath: "/usr/local/bin/openclaw",
          sessionId: "session-1",
        },
        buildBridgeProcessEnv(),
      ),
    ).toThrow(/OpenClaw workspace is not configured/);
  });
});
