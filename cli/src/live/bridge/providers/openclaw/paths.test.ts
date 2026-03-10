import { describe, expect, it } from "vitest";
import {
  resolveOpenClawConfigPath,
  resolveOpenClawHome,
  resolveOpenClawStateDir,
} from "./paths.js";

describe("openclaw-paths", () => {
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
});
