import { describe, expect, it } from "vitest";
import { resolveOpenClawHome, resolveOpenClawStateDir } from "./paths.js";

describe("openclaw/paths", () => {
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
});
