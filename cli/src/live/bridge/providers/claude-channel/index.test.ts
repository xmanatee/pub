import { describe, expect, it } from "vitest";
import { coerceConfigVarInput, getConfigVar } from "../../../../core/config/registry.js";
import { BRIDGE_MODES } from "../types.js";

describe("BridgeMode registry completeness", () => {
  it("parseBridgeModeValue accepts all BridgeMode values", () => {
    const definition = getConfigVar("bridge.mode");
    expect(definition).not.toBeNull();
    for (const mode of BRIDGE_MODES) {
      expect(coerceConfigVarInput(definition!, mode)).toBe(mode);
    }
  });
});

describe("createClaudeChannelBridgeRunner", () => {
  it("rejects when mode is not claude-channel", async () => {
    const { createClaudeChannelBridgeRunner } = await import("./index.js");
    await expect(
      createClaudeChannelBridgeRunner({
        slug: "test",
        sessionBriefing: "briefing",
        bridgeSettings: {
          mode: "claude-code",
          verbose: false,
          workspaceDir: "/tmp",
          attachmentDir: "/tmp",
          artifactsDir: "/tmp/artifacts",
          commandDefaultTimeoutMs: 15_000,
          commandMaxOutputBytes: 256 * 1024,
          commandMaxConcurrent: 6,
          commandAgentDefaultProfile: "default",
          claudeCodePath: "/usr/bin/claude",
        },
        sendMessage: async () => true,
        onActivityChange: () => {},
        debugLog: () => {},
      }),
    ).rejects.toThrow("Claude Channel runtime is not prepared.");
  });
});
