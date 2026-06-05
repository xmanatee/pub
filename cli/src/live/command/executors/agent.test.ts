import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  executeAgentCommand,
  resolveDetachedAgentCommand,
  resolveDetachedAgentModel,
  resolveMainAgentCommandProvider,
  validateMainModeAgentSpec,
} from "../../bridge/providers/agent-command.js";

const baseBridgeSettings = {
  verbose: false,
  workspaceDir: process.cwd(),
  attachmentDir: process.cwd(),
  artifactsDir: process.cwd(),
  commandDefaultTimeoutMs: 15_000,
  commandMaxOutputBytes: 256 * 1024,
  commandMaxConcurrent: 6,
  commandAgentDefaultProfile: "default" as const,
};

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("agent command executor helpers", () => {
  it("resolves active bridge provider for main mode auto", () => {
    expect(
      resolveMainAgentCommandProvider({
        bridgeSettings: {
          ...baseBridgeSettings,
          mode: "claude-sdk",
          claudeCodePath: "/usr/local/bin/claude",
        },
        provider: "auto",
      }),
    ).toBe("claude-sdk");
  });

  it("rejects main mode provider mismatches", () => {
    expect(() =>
      resolveMainAgentCommandProvider({
        bridgeSettings: {
          ...baseBridgeSettings,
          mode: "claude-code",
          claudeCodePath: "/usr/local/bin/claude",
        },
        provider: "openclaw",
      }),
    ).toThrow(/AGENT_MAIN_PROVIDER_MISMATCH/);
  });

  it("resolves detached provider and configured fast model", () => {
    expect(
      resolveDetachedAgentCommand({
        bridgeSettings: {
          ...baseBridgeSettings,
          mode: "claude-code",
          claudeCodePath: "/usr/local/bin/claude",
          commandAgentDetachedProvider: "claude-code",
          claudeCodeCommandModelFast: "claude-fast",
        },
        spec: {
          kind: "agent",
          prompt: "Summarize",
          mode: "detached",
          profile: "fast",
        },
      }),
    ).toEqual({
      provider: "claude-code",
      profile: "fast",
      model: "claude-fast",
    });
  });

  it("resolves openclaw-like as the detached provider for an openclaw-like bridge", () => {
    expect(
      resolveDetachedAgentCommand({
        bridgeSettings: {
          ...baseBridgeSettings,
          mode: "openclaw-like",
          openclawLikeCommand: "/usr/local/bin/codex-bridge",
        },
        spec: {
          kind: "agent",
          prompt: "Tell a joke",
          mode: "detached",
          profile: "fast",
        },
      }),
    ).toEqual({
      provider: "openclaw-like",
      profile: "fast",
      model: undefined,
    });
  });

  it("runs detached openclaw-like commands through the configured command", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pub-openclaw-like-agent-"));
    tempDirs.push(dir);
    const command = join(dir, "agent");
    const promptFile = join(dir, "prompt.txt");
    writeFileSync(
      command,
      [
        "#!/usr/bin/env bash",
        "set -euo pipefail",
        `printf '%s' "$1" > ${JSON.stringify(promptFile)}`,
        `printf '%s' '{"answer":"ok"}'`,
      ].join("\n"),
    );
    await chmod(command, 0o755);

    const value = await executeAgentCommand({
      prompt: "Return an answer.",
      timeoutMs: 15_000,
      output: "json",
      maxOutputBytes: 4096,
      signal: new AbortController().signal,
      bridgeSettings: {
        ...baseBridgeSettings,
        mode: "openclaw-like",
        openclawLikeCommand: command,
      },
      spec: {
        kind: "agent",
        prompt: "Return an answer.",
        mode: "detached",
      },
    });

    expect(value).toEqual({ answer: "ok" });
    expect(readFileSync(promptFile, "utf8")).toContain("[Pub detached agent command]");
  });

  it("resolves detached SDK model defaults from bridge settings", () => {
    expect(
      resolveDetachedAgentModel({
        bridgeSettings: {
          ...baseBridgeSettings,
          mode: "claude-sdk",
          claudeCodePath: "/usr/local/bin/claude",
          claudeSdkCommandModelDefault: "sdk-default",
        },
        provider: "claude-sdk",
      }),
    ).toBe("sdk-default");
  });

  it("rejects main mode profile overrides", () => {
    expect(() =>
      validateMainModeAgentSpec({
        kind: "agent",
        prompt: "Explain",
        mode: "main",
        profile: "fast",
      }),
    ).toThrow(/AGENT_MODEL_OVERRIDE_INVALID/);
  });
});
