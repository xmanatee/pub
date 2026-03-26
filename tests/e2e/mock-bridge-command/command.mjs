#!/usr/bin/env node

/**
 * Mock bridge command for E2E tests (openclaw-like bridge).
 *
 * Receives the full prompt as process.argv[2].
 * Reads rules from MOCK_COMMAND_RULES_FILE (JSON array).
 * Matches prompt via includes(), executes shell commands.
 *
 * Rule format: { match: string, commands: string[] }
 *
 * Run with: node tests/e2e/mock-bridge-command/command.mjs "<prompt>"
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const prompt = process.argv[2] ?? "";
const rulesFile = process.env.MOCK_COMMAND_RULES_FILE ?? "/tmp/mock-command-rules.json";

const exactCommandMatch = prompt.match(/Run this exact command now:\n(.+)/);
if (exactCommandMatch?.[1]) {
  execSync(exactCommandMatch[1], {
    stdio: "inherit",
    env: process.env,
    timeout: 30_000,
    shell: true,
  });
  process.exit(0);
}

let rules = [];
try {
  rules = JSON.parse(readFileSync(rulesFile, "utf-8"));
} catch {}

for (const rule of rules) {
  if (prompt.includes(rule.match)) {
    for (const cmd of rule.commands ?? []) {
      try {
        execSync(cmd, { stdio: "inherit", env: process.env, timeout: 30_000 });
      } catch (err) {
        console.error(`[mock-command] Failed to execute: ${cmd}`, err.message);
      }
    }
    break;
  }
}
