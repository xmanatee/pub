import { afterEach, describe, expect, it } from "vitest";
import { buildSdkSessionOptions, isClaudeSdkAvailableInEnv } from "./index.js";

const envKeys = [
  "CLAUDE_CODE_PATH",
  "CLAUDE_CODE_MODEL",
  "CLAUDE_CODE_ALLOWED_TOOLS",
  "CLAUDE_CODE_APPEND_SYSTEM_PROMPT",
  "CLAUDE_CODE_MAX_TURNS",
  "CLAUDECODE",
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

describe("isClaudeSdkAvailableInEnv", () => {
  it("returns true when CLAUDE_CODE_PATH points to existing file", () => {
    process.env.CLAUDE_CODE_PATH = "/bin/sh";
    expect(isClaudeSdkAvailableInEnv(process.env)).toBe(true);
  });

  it("returns false when CLAUDE_CODE_PATH points to nonexistent file", () => {
    process.env.CLAUDE_CODE_PATH = "/nonexistent/path/to/claude-xxxx";
    expect(isClaudeSdkAvailableInEnv(process.env)).toBe(false);
  });
});

describe("buildSdkSessionOptions", () => {
  it("uses CLAUDE_CODE_MODEL from env", () => {
    process.env.CLAUDE_CODE_MODEL = "opus";
    const opts = buildSdkSessionOptions(process.env);
    expect(opts.model).toBe("opus");
  });

  it("defaults model to claude-sonnet-4-6 when env not set", () => {
    delete process.env.CLAUDE_CODE_MODEL;
    const opts = buildSdkSessionOptions(process.env);
    expect(opts.model).toBe("claude-sonnet-4-6");
  });

  it("splits CLAUDE_CODE_ALLOWED_TOOLS on comma", () => {
    process.env.CLAUDE_CODE_ALLOWED_TOOLS = "Bash,Read,Write";
    const opts = buildSdkSessionOptions(process.env);
    expect(opts.allowedTools).toEqual(["Bash", "Read", "Write"]);
  });

  it("returns undefined allowedTools when env not set", () => {
    delete process.env.CLAUDE_CODE_ALLOWED_TOOLS;
    const opts = buildSdkSessionOptions(process.env);
    expect(opts.allowedTools).toBeUndefined();
  });

  it("strips CLAUDECODE from sdkEnv", () => {
    process.env.CLAUDECODE = "1";
    const opts = buildSdkSessionOptions(process.env);
    expect(opts.sdkEnv.CLAUDECODE).toBeUndefined();
  });

  it("ignores blank model env var", () => {
    process.env.CLAUDE_CODE_MODEL = "   ";
    const opts = buildSdkSessionOptions(process.env);
    expect(opts.model).toBe("claude-sonnet-4-6");
  });
});
