import { afterEach, describe, expect, it } from "vitest";
import {
  buildSdkSessionOptions,
  buildSdkSessionOptionsFromSettings,
  isClaudeSdkAvailableInEnv,
} from "./index.js";

const envKeys = ["CLAUDE_CODE_PATH", "CLAUDECODE"] as const;

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
  it("uses hardcoded default model", () => {
    const opts = buildSdkSessionOptions(process.env);
    expect(opts.model).toBe("claude-sonnet-4-6");
  });

  it("maps live model profiles to Claude model aliases", () => {
    const opts = buildSdkSessionOptionsFromSettings({
      mode: "claude-sdk",
      verbose: false,
      bridgeCwd: "/tmp/project",
      attachmentDir: "/tmp/attachments",
      commandDefaultTimeoutMs: 15_000,
      commandMaxOutputBytes: 256 * 1024,
      commandMaxConcurrent: 6,
      commandAgentDefaultProfile: "default",
      claudeCodePath: "/usr/local/bin/claude",
      liveModelProfile: "fast",
    });

    expect(opts.model).toBe("haiku");
  });

  it("strips CLAUDECODE from sdkEnv", () => {
    process.env.CLAUDECODE = "1";
    const opts = buildSdkSessionOptions(process.env);
    expect(opts.sdkEnv.CLAUDECODE).toBeUndefined();
  });
});
