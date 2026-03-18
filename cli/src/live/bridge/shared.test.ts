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
  ['pub write "', "chat messages via pub write"],
  ["pub write -c canvas -f", "canvas updates via pub write"],

  // Canvas interactivity
  ["pub.files.upload", "file upload from canvas to daemon"],
  ["pub.files.download", "file download from daemon to browser"],
  ["pub-command-manifest", "command manifest embedding in HTML"],
  ["pub.command(", "command invocation from canvas JS"],

  // Pub management
  ["pub update", "pub metadata updates via CLI"],
  ["--title", "title flag for metadata updates"],
  ["--description", "description flag for metadata updates"],
];

/**
 * Capabilities that must be in the SYSTEM_PROMPT specifically (not just the briefing).
 * These are behavioral instructions the agent needs regardless of session context.
 */
const REQUIRED_SYSTEM_PROMPT_CAPABILITIES: ReadonlyArray<readonly [string, string]> = [
  // Communication
  ['pub write "', "chat message syntax"],
  ["pub write -c canvas -f", "canvas update syntax"],

  // Canvas
  ["sandboxed iframe", "canvas rendering model"],
  ["self-contained", "self-contained HTML requirement"],
  ["console.error", "render error capture"],
  ["sensitive data", "sensitive data prohibition"],

  // Commands — specific usage patterns, not just existence
  ["pub-command-manifest+json", "manifest script tag declaration"],
  ["pub.command(name, args)", "command invocation syntax"],
  ["pub.files.upload(", "file upload call signature"],
  ["pub.files.download(", "file download call signature"],

  // Pub management
  ["pub update", "metadata update command"],
  ["--title", "title flag"],
  ["--description", "description flag"],
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
