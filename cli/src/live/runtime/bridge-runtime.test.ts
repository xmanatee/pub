import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildBridgeProcessEnv, buildBridgeSettings } from "./bridge-runtime.js";

describe("bridge-runtime", () => {
  const originalEnv = {
    PUB_HOME: process.env.PUB_HOME,
    PUB_PROJECT_ROOT: process.env.PUB_PROJECT_ROOT,
  };

  afterEach(() => {
    process.env.PUB_HOME = originalEnv.PUB_HOME;
    process.env.PUB_PROJECT_ROOT = originalEnv.PUB_PROJECT_ROOT;
    if (!originalEnv.PUB_HOME) delete process.env.PUB_HOME;
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
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pub-home-"));
    process.env.PUB_HOME = tempDir;
    process.env.PUB_PROJECT_ROOT = "/tmp/pub-project";

    const bridgeSettings = buildBridgeSettings(
      "claude-code",
      {
        claudeCodePath: "/usr/local/bin/claude",
      },
      buildBridgeProcessEnv(),
    );

    expect(bridgeSettings.workspaceDir).toBe("/tmp/pub-project");
    expect(bridgeSettings.attachmentDir).toContain("/runtime/attachments");
    expect(bridgeSettings.artifactsDir).toContain("/runtime/artifacts");
    expect(bridgeSettings.commandDefaultTimeoutMs).toBe(15_000);
    expect(bridgeSettings.commandAgentDefaultProfile).toBe("default");
    expect(bridgeSettings.verbose).toBe(false);
  });

  it("uses saved bridge.verbose for runtime verbosity", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pub-home-"));
    process.env.PUB_HOME = tempDir;
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
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pub-home-"));

    const bridgeSettings = buildBridgeSettings(
      "openclaw-like",
      {
        claudeCodePath: "/usr/local/bin/claude",
        openclawLikeCommand: "/tmp/openclaw-like-command",
        openclawPath: "/usr/local/bin/openclaw",
        sessionId: "session-2",
      },
      {
        ...process.env,
        PUB_HOME: tempDir,
        PUB_PROJECT_ROOT: "/tmp/pub-project",
      },
    );

    expect(bridgeSettings.mode).toBe("openclaw-like");
    expect(bridgeSettings.workspaceDir).toBe("/tmp/pub-project");
    expect(bridgeSettings.claudeCodePath).toBe("/usr/local/bin/claude");
    expect(bridgeSettings.openclawPath).toBe("/usr/local/bin/openclaw");
    expect(bridgeSettings.sessionId).toBe("session-2");
  });

  it("reads detached agent command profile and model overrides from env", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pub-home-"));

    const bridgeSettings = buildBridgeSettings(
      "claude-code",
      {
        claudeCodePath: "/usr/local/bin/claude",
      },
      {
        ...process.env,
        PUB_HOME: tempDir,
        PUB_PROJECT_ROOT: "/tmp/pub-project",
        PUB_COMMAND_AGENT_DEFAULT_PROFILE: "fast",
        PUB_COMMAND_AGENT_DETACHED_PROVIDER: "claude-sdk",
        CLAUDE_CODE_COMMAND_MODEL_FAST: "claude-fast",
      },
    );

    expect(bridgeSettings.commandAgentDefaultProfile).toBe("fast");
    expect(bridgeSettings.commandAgentDetachedProvider).toBe("claude-sdk");
    expect(bridgeSettings.claudeCodeCommandModelFast).toBe("claude-fast");
  });

  it("uses the project root as the base workspace for OpenClaw runtime settings", () => {
    const bridgeSettings = buildBridgeSettings(
      "openclaw",
      {
        openclawPath: "/usr/local/bin/openclaw",
        sessionId: "session-1",
      },
      {
        ...buildBridgeProcessEnv(),
        PUB_PROJECT_ROOT: "/tmp/pub-project",
      },
    );

    expect(bridgeSettings.workspaceDir).toBe("/tmp/pub-project");
  });
});
