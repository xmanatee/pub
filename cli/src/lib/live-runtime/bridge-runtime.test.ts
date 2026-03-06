import { afterEach, describe, expect, it } from "vitest";
import { buildBridgeProcessEnv } from "./bridge-runtime.js";

describe("bridge-runtime", () => {
  const originalEnv = {
    OPENCLAW_HOME: process.env.OPENCLAW_HOME,
    OPENCLAW_STATE_DIR: process.env.OPENCLAW_STATE_DIR,
    OPENCLAW_CONFIG_PATH: process.env.OPENCLAW_CONFIG_PATH,
    OPENCLAW_WORKSPACE: process.env.OPENCLAW_WORKSPACE,
    PUBBLUE_PROJECT_ROOT: process.env.PUBBLUE_PROJECT_ROOT,
  };

  afterEach(() => {
    process.env.OPENCLAW_HOME = originalEnv.OPENCLAW_HOME;
    process.env.OPENCLAW_STATE_DIR = originalEnv.OPENCLAW_STATE_DIR;
    process.env.OPENCLAW_CONFIG_PATH = originalEnv.OPENCLAW_CONFIG_PATH;
    process.env.OPENCLAW_WORKSPACE = originalEnv.OPENCLAW_WORKSPACE;
    process.env.PUBBLUE_PROJECT_ROOT = originalEnv.PUBBLUE_PROJECT_ROOT;
    if (!originalEnv.OPENCLAW_HOME) delete process.env.OPENCLAW_HOME;
    if (!originalEnv.OPENCLAW_STATE_DIR) delete process.env.OPENCLAW_STATE_DIR;
    if (!originalEnv.OPENCLAW_CONFIG_PATH) delete process.env.OPENCLAW_CONFIG_PATH;
    if (!originalEnv.OPENCLAW_WORKSPACE) delete process.env.OPENCLAW_WORKSPACE;
    if (!originalEnv.PUBBLUE_PROJECT_ROOT) delete process.env.PUBBLUE_PROJECT_ROOT;
  });

  it("sets OPENCLAW_WORKSPACE to <OPENCLAW_STATE_DIR>/workspace when no explicit workspace exists", () => {
    delete process.env.OPENCLAW_WORKSPACE;
    process.env.OPENCLAW_STATE_DIR = "/tmp/openclaw-state";
    delete process.env.OPENCLAW_CONFIG_PATH;

    const env = buildBridgeProcessEnv();
    expect(env.OPENCLAW_WORKSPACE).toBe("/tmp/openclaw-state/workspace");
  });

  it("does not override existing OPENCLAW_WORKSPACE", () => {
    process.env.OPENCLAW_WORKSPACE = "/tmp/existing-workspace";
    delete process.env.OPENCLAW_CONFIG_PATH;

    const env = buildBridgeProcessEnv();
    expect(env.OPENCLAW_WORKSPACE).toBe("/tmp/existing-workspace");
  });

  it("uses bridge config openclawWorkspace when env has no workspace", () => {
    delete process.env.OPENCLAW_WORKSPACE;
    delete process.env.OPENCLAW_STATE_DIR;
    delete process.env.OPENCLAW_CONFIG_PATH;

    const env = buildBridgeProcessEnv({ openclawWorkspace: "/tmp/config-workspace" });
    expect(env.OPENCLAW_WORKSPACE).toBe("/tmp/config-workspace");
  });
});
