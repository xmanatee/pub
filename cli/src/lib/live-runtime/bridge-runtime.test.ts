import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildBridgeProcessEnv, prepareBridgeConfigForSave } from "./bridge-runtime.js";

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

  it("prepares concrete runtime defaults for claude bridges", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pub-config-"));
    process.env.PUB_CONFIG_DIR = tempDir;
    process.env.PUB_PROJECT_ROOT = "/tmp/pub-project";

    const prepared = prepareBridgeConfigForSave(
      "claude-code",
      {
        claudeCodePath: "/usr/local/bin/claude",
      },
      buildBridgeProcessEnv(),
    );

    expect(prepared.bridgeCwd).toBe("/tmp/pub-project");
    expect(prepared.attachmentDir).toContain("/attachments");
    expect(prepared.canvasReminderEvery).toBe(10);
    expect(prepared.commandDefaultTimeoutMs).toBe(15_000);
  });

  it("requires explicit OpenClaw workspace in prepared runtime config", () => {
    expect(() =>
      prepareBridgeConfigForSave(
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
