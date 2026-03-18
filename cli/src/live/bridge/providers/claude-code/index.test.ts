import { afterEach, describe, expect, it } from "vitest";
import { buildClaudeArgs, buildClaudeArgsFromSettings, resolveClaudeCodePath } from "./index.js";

const envKeys = ["CLAUDE_CODE_PATH", "CLAUDE_CODE_MAX_TURNS"] as const;

const originalEnv: Record<string, string | undefined> = {};

for (const key of envKeys) {
  originalEnv[key] = process.env[key];
}

afterEach(() => {
  for (const key of envKeys) {
    if (originalEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = originalEnv[key];
    }
  }
});

describe("buildClaudeArgs", () => {
  it("includes base flags", () => {
    delete process.env.CLAUDE_CODE_MAX_TURNS;

    const args = buildClaudeArgs("hello", null);
    expect(args).toContain("-p");
    expect(args).toContain("hello");
    expect(args).toContain("--output-format");
    expect(args).toContain("stream-json");
    expect(args).toContain("--dangerously-skip-permissions");
  });

  it("adds --resume when sessionId is provided", () => {
    delete process.env.CLAUDE_CODE_MAX_TURNS;

    const args = buildClaudeArgs("hello", "session-abc");
    expect(args).toContain("--resume");
    expect(args).toContain("session-abc");
  });

  it("omits --resume when sessionId is null", () => {
    delete process.env.CLAUDE_CODE_MAX_TURNS;

    const args = buildClaudeArgs("hello", null);
    expect(args).not.toContain("--resume");
  });

  it("never includes --append-system-prompt", () => {
    delete process.env.CLAUDE_CODE_MAX_TURNS;

    const args = buildClaudeArgs("test", null);
    expect(args).not.toContain("--append-system-prompt");
  });

  it("includes --max-turns from env", () => {
    process.env.CLAUDE_CODE_MAX_TURNS = "5";

    const args = buildClaudeArgs("test", null);
    expect(args).toContain("--max-turns");
    expect(args).toContain("5");
  });

  it("does not include --model or --allowedTools", () => {
    delete process.env.CLAUDE_CODE_MAX_TURNS;

    const args = buildClaudeArgs("test", null);
    expect(args).not.toContain("--model");
    expect(args).not.toContain("--allowedTools");
  });

  it("maps live model profiles to Claude model aliases", () => {
    const args = buildClaudeArgsFromSettings(
      "test",
      null,
      {
        claudeCodeMaxTurns: 4,
        liveModelProfile: "thorough",
      },
      undefined,
    );

    expect(args).toContain("--model");
    expect(args).toContain("opus");
  });
});

describe("resolveClaudeCodePath", () => {
  it("returns CLAUDE_CODE_PATH when set", () => {
    process.env.CLAUDE_CODE_PATH = "/custom/claude";
    expect(resolveClaudeCodePath()).toBe("/custom/claude");
  });

  it("returns 'claude' as ultimate fallback", () => {
    delete process.env.CLAUDE_CODE_PATH;
    // `which claude` may or may not find it; if it doesn't, we get "claude"
    const result = resolveClaudeCodePath();
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });
});
