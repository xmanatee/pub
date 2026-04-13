/**
 * Mock command fixture for E2E tests (openclaw-like bridge).
 *
 * Manages the rules file that the mock command script reads.
 * File-based (no server) — the command script reads rules on every invocation.
 */
import { readFileSync, writeFileSync } from "node:fs";

const RULES_FILE = process.env.MOCK_COMMAND_RULES_FILE ?? "/tmp/mock-command-rules.json";

interface CommandRule {
  match: string;
  commands: string[];
}

function readRules(): CommandRule[] {
  try {
    return JSON.parse(readFileSync(RULES_FILE, "utf-8")) as CommandRule[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

function writeRules(rules: CommandRule[]): void {
  writeFileSync(RULES_FILE, JSON.stringify(rules, null, 2));
}

/** Add a rule: when prompt contains `match`, execute `commands`. */
export function addCommandRule(match: string, commands: string[]): void {
  const rules = readRules();
  rules.push({ match, commands });
  writeRules(rules);
}

/** Clear all rules. */
export function clearCommandRules(): void {
  writeRules([]);
}

// ---------------------------------------------------------------------------
// Convenience helpers
// ---------------------------------------------------------------------------

/** Command echo: when prompt contains X, print Y to stdout (bridge forwards to chat). */
export function addCommandEchoRule(match: string, reply: string): void {
  addCommandRule(match, [`echo "${reply}"`]);
}

/** Command canvas update: when prompt contains X, write HTML and send via canvas channel. */
export function addCommandCanvasRule(match: string, html: string, chatReply?: string): void {
  const tmpFile = `/tmp/mock-cmd-canvas-${Date.now()}.html`;
  const b64 = Buffer.from(html).toString("base64");
  const commands = [
    `sh -c "echo '${b64}' | base64 -d > ${tmpFile}"`,
    `pub write -c canvas -f ${tmpFile}`,
  ];
  if (chatReply) {
    commands.push(`echo "${chatReply}"`);
  }
  addCommandRule(match, commands);
}

/** Set up default rules for openclaw-like tests. */
export function setupDefaultCommandRules(): void {
  clearCommandRules();
}
