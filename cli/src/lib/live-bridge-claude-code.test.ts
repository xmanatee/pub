import { afterEach, describe, expect, it } from "vitest";
import { buildClaudeArgs, resolveClaudeCodePath } from "../live/bridge/providers/claude-code.js";

const envKeys = [
  "CLAUDE_CODE_PATH",
  "CLAUDE_CODE_MODEL",
  "CLAUDE_CODE_ALLOWED_TOOLS",
  "CLAUDE_CODE_APPEND_SYSTEM_PROMPT",
  "CLAUDE_CODE_MAX_TURNS",
] as const;

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
    delete process.env.CLAUDE_CODE_MODEL;
    delete process.env.CLAUDE_CODE_ALLOWED_TOOLS;
    delete process.env.CLAUDE_CODE_APPEND_SYSTEM_PROMPT;
    delete process.env.CLAUDE_CODE_MAX_TURNS;

    const args = buildClaudeArgs("hello", null, null);
    expect(args).toContain("-p");
    expect(args).toContain("hello");
    expect(args).toContain("--output-format");
    expect(args).toContain("stream-json");
    expect(args).toContain("--dangerously-skip-permissions");
  });

  it("adds --resume when sessionId is provided", () => {
    delete process.env.CLAUDE_CODE_MODEL;
    delete process.env.CLAUDE_CODE_ALLOWED_TOOLS;
    delete process.env.CLAUDE_CODE_APPEND_SYSTEM_PROMPT;
    delete process.env.CLAUDE_CODE_MAX_TURNS;

    const args = buildClaudeArgs("hello", "session-abc", null);
    expect(args).toContain("--resume");
    expect(args).toContain("session-abc");
  });

  it("omits --resume when sessionId is null", () => {
    delete process.env.CLAUDE_CODE_MODEL;
    delete process.env.CLAUDE_CODE_ALLOWED_TOOLS;
    delete process.env.CLAUDE_CODE_APPEND_SYSTEM_PROMPT;
    delete process.env.CLAUDE_CODE_MAX_TURNS;

    const args = buildClaudeArgs("hello", null, null);
    expect(args).not.toContain("--resume");
  });

  it("includes --model from env", () => {
    process.env.CLAUDE_CODE_MODEL = "opus";
    delete process.env.CLAUDE_CODE_ALLOWED_TOOLS;
    delete process.env.CLAUDE_CODE_APPEND_SYSTEM_PROMPT;
    delete process.env.CLAUDE_CODE_MAX_TURNS;

    const args = buildClaudeArgs("test", null, null);
    expect(args).toContain("--model");
    expect(args).toContain("opus");
  });

  it("includes --allowedTools from env", () => {
    delete process.env.CLAUDE_CODE_MODEL;
    process.env.CLAUDE_CODE_ALLOWED_TOOLS = "Bash,Read,Write";
    delete process.env.CLAUDE_CODE_APPEND_SYSTEM_PROMPT;
    delete process.env.CLAUDE_CODE_MAX_TURNS;

    const args = buildClaudeArgs("test", null, null);
    expect(args).toContain("--allowedTools");
    expect(args).toContain("Bash,Read,Write");
  });

  it("includes systemPrompt in --append-system-prompt", () => {
    delete process.env.CLAUDE_CODE_MODEL;
    delete process.env.CLAUDE_CODE_ALLOWED_TOOLS;
    delete process.env.CLAUDE_CODE_APPEND_SYSTEM_PROMPT;
    delete process.env.CLAUDE_CODE_MAX_TURNS;

    const args = buildClaudeArgs("test", null, "You are helpful.");
    expect(args).toContain("--append-system-prompt");
    expect(args).toContain("You are helpful.");
  });

  it("merges systemPrompt with env CLAUDE_CODE_APPEND_SYSTEM_PROMPT", () => {
    delete process.env.CLAUDE_CODE_MODEL;
    delete process.env.CLAUDE_CODE_ALLOWED_TOOLS;
    process.env.CLAUDE_CODE_APPEND_SYSTEM_PROMPT = "Be concise.";
    delete process.env.CLAUDE_CODE_MAX_TURNS;

    const args = buildClaudeArgs("test", null, "You are helpful.");
    const idx = args.indexOf("--append-system-prompt");
    expect(idx).toBeGreaterThan(-1);
    expect(args[idx + 1]).toContain("You are helpful.");
    expect(args[idx + 1]).toContain("Be concise.");
  });

  it("includes --append-system-prompt from env when systemPrompt is null", () => {
    delete process.env.CLAUDE_CODE_MODEL;
    delete process.env.CLAUDE_CODE_ALLOWED_TOOLS;
    process.env.CLAUDE_CODE_APPEND_SYSTEM_PROMPT = "Be concise.";
    delete process.env.CLAUDE_CODE_MAX_TURNS;

    const args = buildClaudeArgs("test", null, null);
    expect(args).toContain("--append-system-prompt");
    expect(args).toContain("Be concise.");
  });

  it("includes --max-turns from env", () => {
    delete process.env.CLAUDE_CODE_MODEL;
    delete process.env.CLAUDE_CODE_ALLOWED_TOOLS;
    delete process.env.CLAUDE_CODE_APPEND_SYSTEM_PROMPT;
    process.env.CLAUDE_CODE_MAX_TURNS = "5";

    const args = buildClaudeArgs("test", null, null);
    expect(args).toContain("--max-turns");
    expect(args).toContain("5");
  });

  it("ignores blank env vars", () => {
    process.env.CLAUDE_CODE_MODEL = "   ";
    delete process.env.CLAUDE_CODE_ALLOWED_TOOLS;
    delete process.env.CLAUDE_CODE_APPEND_SYSTEM_PROMPT;
    delete process.env.CLAUDE_CODE_MAX_TURNS;

    const args = buildClaudeArgs("test", null, null);
    expect(args).not.toContain("--model");
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
