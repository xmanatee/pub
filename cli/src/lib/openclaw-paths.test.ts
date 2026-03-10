import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  resolveOpenClawConfigPath,
  resolveOpenClawHome,
  resolveOpenClawStateDir,
  resolveOpenClawWorkspaceDir,
} from "./openclaw-paths.js";

describe("openclaw-paths", () => {
  const tempRoots: string[] = [];

  afterEach(() => {
    for (const dir of tempRoots) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tempRoots.length = 0;
  });

  function makeTempDir(prefix = "pub-openclaw-paths-"): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    tempRoots.push(dir);
    return dir;
  }

  describe("resolveOpenClawHome", () => {
    it("uses OPENCLAW_HOME when set", () => {
      expect(resolveOpenClawHome({ OPENCLAW_HOME: "/custom/home" })).toBe("/custom/home");
    });

    it("expands OPENCLAW_HOME=~/... using HOME", () => {
      const result = resolveOpenClawHome({ OPENCLAW_HOME: "~/sandbox", HOME: "/tmp/home-user" });
      expect(result).toBe("/tmp/home-user/sandbox");
    });
  });

  describe("resolveOpenClawStateDir", () => {
    it("uses OPENCLAW_STATE_DIR when set", () => {
      const result = resolveOpenClawStateDir({ OPENCLAW_STATE_DIR: "/tmp/openclaw-state" });
      expect(result).toBe("/tmp/openclaw-state");
    });

    it("defaults to <openclaw-home>/.openclaw", () => {
      const result = resolveOpenClawStateDir({ OPENCLAW_HOME: "/tmp/home-root" });
      expect(result).toBe("/tmp/home-root/.openclaw");
    });
  });

  describe("resolveOpenClawConfigPath", () => {
    it("uses OPENCLAW_CONFIG_PATH when set", () => {
      const result = resolveOpenClawConfigPath({ OPENCLAW_CONFIG_PATH: "/tmp/openclaw.json" });
      expect(result).toBe("/tmp/openclaw.json");
    });

    it("defaults to <stateDir>/openclaw.json", () => {
      const result = resolveOpenClawConfigPath({ OPENCLAW_STATE_DIR: "/tmp/openclaw-state" });
      expect(result).toBe("/tmp/openclaw-state/openclaw.json");
    });
  });

  describe("resolveOpenClawWorkspaceDir", () => {
    it("uses OPENCLAW_WORKSPACE when set", () => {
      const result = resolveOpenClawWorkspaceDir({ OPENCLAW_WORKSPACE: "/tmp/ws-explicit" });
      expect(result).toBe("/tmp/ws-explicit");
    });

    it("reads agents.defaults.workspace from openclaw config", () => {
      const tmpDir = makeTempDir();
      const stateDir = path.join(tmpDir, ".openclaw");
      fs.mkdirSync(stateDir, { recursive: true });
      fs.writeFileSync(
        path.join(stateDir, "openclaw.json"),
        JSON.stringify({
          agents: {
            defaults: {
              workspace: "~/.openclaw/workspace-main",
            },
          },
        }),
      );

      const result = resolveOpenClawWorkspaceDir({ HOME: tmpDir });
      expect(result).toBe(path.join(tmpDir, ".openclaw", "workspace-main"));
    });

    it("supports legacy workspace field and relative paths", () => {
      const tmpDir = makeTempDir();
      const configPath = path.join(tmpDir, "custom-state", "openclaw.json");
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
      fs.writeFileSync(configPath, JSON.stringify({ workspace: "workspace-rel" }));

      const result = resolveOpenClawWorkspaceDir({ OPENCLAW_CONFIG_PATH: configPath });
      expect(result).toBe(path.join(path.dirname(configPath), "workspace-rel"));
    });

    it("falls back to <stateDir>/workspace", () => {
      const result = resolveOpenClawWorkspaceDir({ OPENCLAW_STATE_DIR: "/tmp/openclaw-state" });
      expect(result).toBe("/tmp/openclaw-state/workspace");
    });
  });
});
