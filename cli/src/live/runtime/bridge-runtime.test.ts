import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildBridgeProcessEnv, buildBridgeSettings } from "./bridge-runtime.js";

describe("bridge-runtime", () => {
  const originalEnv = {
    PUB_CONFIG_DIR: process.env.PUB_CONFIG_DIR,
    PUB_PROJECT_ROOT: process.env.PUB_PROJECT_ROOT,
  };

  afterEach(() => {
    process.env.PUB_CONFIG_DIR = originalEnv.PUB_CONFIG_DIR;
    process.env.PUB_PROJECT_ROOT = originalEnv.PUB_PROJECT_ROOT;
    if (!originalEnv.PUB_CONFIG_DIR) delete process.env.PUB_CONFIG_DIR;
    if (!originalEnv.PUB_PROJECT_ROOT) delete process.env.PUB_PROJECT_ROOT;
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
    expect(bridgeSettings.verbose).toBe(false);
  });

  it("uses saved bridge.verbose for runtime verbosity", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pub-config-"));
    process.env.PUB_CONFIG_DIR = tempDir;
    process.env.PUB_PROJECT_ROOT = "/tmp/pub-project";

    const bridgeSettings = buildBridgeSettings(
      "claude-code",
      {
        claudeCodePath: "/usr/local/bin/claude",
        verbose: true,
      },
      buildBridgeProcessEnv(),
    );

    expect(bridgeSettings.verbose).toBe(true);
  });

  it("keeps optional local agent runtimes available across bridge modes", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pub-config-"));

    const bridgeSettings = buildBridgeSettings(
      "openclaw-like",
      {
        bridgeCwd: "/tmp/shared-runtime",
        claudeCodePath: "/usr/local/bin/claude",
        openclawLikeCommand: "/tmp/openclaw-like-command",
        openclawPath: "/usr/local/bin/openclaw",
        sessionId: "session-2",
      },
      {
        ...process.env,
        PUB_CONFIG_DIR: tempDir,
        PUB_PROJECT_ROOT: "/tmp/pub-project",
      },
    );

    expect(bridgeSettings.mode).toBe("openclaw-like");
    expect(bridgeSettings.bridgeCwd).toBe("/tmp/shared-runtime");
    expect(bridgeSettings.claudeCodePath).toBe("/usr/local/bin/claude");
    expect(bridgeSettings.openclawPath).toBe("/usr/local/bin/openclaw");
    expect(bridgeSettings.sessionId).toBe("session-2");
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
