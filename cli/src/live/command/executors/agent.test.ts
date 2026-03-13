import { describe, expect, it } from "vitest";
import {
  resolveDetachedAgentCommand,
  resolveDetachedAgentModel,
  resolveMainAgentCommandProvider,
  validateMainModeAgentSpec,
} from "../../bridge/providers/agent-command.js";

const baseBridgeSettings = {
  verbose: false,
  bridgeCwd: "/tmp/pub-bridge",
  canvasReminderEvery: 10,
  attachmentDir: "/tmp/pub-attachments",
  commandDefaultTimeoutMs: 15_000,
  commandMaxOutputBytes: 256 * 1024,
  commandMaxConcurrent: 6,
  commandAgentDefaultProfile: "default" as const,
};

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
