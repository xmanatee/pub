import { describe, expect, it } from "vitest";
import { SYSTEM_PROMPT } from "../prompts/index.js";
import { buildSessionBriefing } from "./shared.js";

/**
 * Session briefing capability checklist.
 *
 * The session briefing is the agent's primary instruction set during a live session.
 * Every agent-facing capability MUST be documented in it. When you add a new capability
 * (e.g. a new pub.files method, a new pub CLI command the agent should use, a new
 * canvas API), add an entry here. The test will fail until the prompt is updated.
 *
 * Each entry: [substring that must appear in the assembled briefing, human-readable label].
 */
const REQUIRED_BRIEFING_CAPABILITIES: ReadonlyArray<readonly [string, string]> = [
  // Communication
  ["reply naturally", "chat delivered via natural assistant text"],
  ["pub write -c canvas -f", "canvas updates via pub write"],

  // Canvas interactivity
  ["/__pub_files__/", "host file access via pub-fs URLs"],
  ["pub-command-manifest", "command manifest embedding in HTML"],
  ["pub.command(", "command invocation from canvas JS"],

  // Pub management
  ["pub update", "pub metadata updates via CLI"],
  ["og:title", "OG title tag for metadata"],
  ["og:description", "OG description tag for metadata"],
];

/**
 * Capabilities that must be in the SYSTEM_PROMPT specifically (not just the briefing).
 * These are behavioral instructions the agent needs regardless of session context.
 */
const REQUIRED_SYSTEM_PROMPT_CAPABILITIES: ReadonlyArray<readonly [string, string]> = [
  // Communication
  ["reply naturally", "chat delivered via natural assistant text"],
  ["pub write -c canvas -f", "canvas update syntax"],

  // Canvas
  ["sandboxed iframe", "canvas rendering model"],
  ["Self-contained", "self-contained HTML requirement"],
  ["console.error", "render error capture"],
  ["sensitive data", "sensitive data prohibition"],

  // Canvas — command-manifest reference
  ["command-manifest", "command-manifest reference in canvas section"],

  // Pub management
  ["pub update", "metadata update command"],
  ["og:title", "OG title tag"],
  ["og:description", "OG description tag"],
];

describe("session briefing completeness", () => {
  const briefing = buildSessionBriefing("test-slug", {
    title: "Test",
    description: "A test pub",
    isPublic: false,
  });

  for (const [keyword, capability] of REQUIRED_BRIEFING_CAPABILITIES) {
    it(`documents: ${capability}`, () => {
      expect(briefing).toContain(keyword);
    });
  }
});

describe("system prompt completeness", () => {
  for (const [keyword, capability] of REQUIRED_SYSTEM_PROMPT_CAPABILITIES) {
    it(`documents: ${capability}`, () => {
      expect(SYSTEM_PROMPT).toContain(keyword);
    });
  }
});
