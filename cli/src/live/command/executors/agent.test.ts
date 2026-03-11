import { describe, expect, it } from "vitest";
import { resolveAgentCommandProvider } from "../../bridge/providers/agent-command.js";

const baseBridgeSettings = {
  verbose: false,
  bridgeCwd: "/tmp/pub-bridge",
  canvasReminderEvery: 10,
  attachmentDir: "/tmp/pub-attachments",
  commandDefaultTimeoutMs: 15_000,
  commandMaxOutputBytes: 256 * 1024,
  commandMaxConcurrent: 6,
};

describe("resolveAgentCommandProvider", () => {
  it("prefers OpenClaw for auto provider in openclaw bridge mode", () => {
    expect(
      resolveAgentCommandProvider({
        bridgeSettings: {
          ...baseBridgeSettings,
          mode: "openclaw",
          openclawPath: "/usr/local/bin/openclaw",
          sessionId: "session-1",
        },
        provider: "auto",
      }),
    ).toBe("openclaw");
  });

  it("falls back to Claude Code in openclaw-like mode when configured", () => {
    expect(
      resolveAgentCommandProvider({
        bridgeSettings: {
          ...baseBridgeSettings,
          mode: "openclaw-like",
          claudeCodePath: "/usr/local/bin/claude",
          openclawLikeCommand: "/tmp/openclaw-like-command",
        },
        provider: "auto",
      }),
    ).toBe("claude-code");
  });

  it("accepts explicit OpenClaw provider outside openclaw bridge mode when runtime is configured", () => {
    expect(
      resolveAgentCommandProvider({
        bridgeSettings: {
          ...baseBridgeSettings,
          mode: "claude-code",
          claudeCodePath: "/usr/local/bin/claude",
          openclawPath: "/usr/local/bin/openclaw",
          sessionId: "session-2",
        },
        provider: "openclaw",
      }),
    ).toBe("openclaw");
  });

  it("raises a configuration error when the requested provider is unavailable", () => {
    expect(() =>
      resolveAgentCommandProvider({
        bridgeSettings: {
          ...baseBridgeSettings,
          mode: "openclaw-like",
          openclawLikeCommand: "/tmp/openclaw-like-command",
        },
        provider: "claude-code",
      }),
    ).toThrow(/Claude runtime is not configured/);
  });
});
