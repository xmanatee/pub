/**
 * Convex admin client for E2E tests.
 * Manages state file, runs admin mutations, and provides typed access to test state.
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface E2EState {
  adminKey: string;
  convexUrl: string;
  convexSiteUrl: string;
  convexProxyUrl: string;
  users: TestUser[];
}

export interface TestUser {
  userId: string;
  apiKey: string;
  apiKeyId: string;
  refreshToken: string;
  name: string;
}

const STATE_FILE = join(tmpdir(), "pub-e2e-state.json");

let cachedState: E2EState | null = null;

export function getState(): E2EState {
  if (cachedState) return cachedState;
  const raw = readFileSync(STATE_FILE, "utf-8");
  const parsed: E2EState = JSON.parse(raw);
  cachedState = parsed;
  return parsed;
}

export function writeState(state: E2EState): void {
  cachedState = state;
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

export function runConvexCommand(args: string): string {
  const { adminKey, convexUrl } = getState();
  return execSync(`npx convex ${args} --admin-key "${adminKey}" --url "${convexUrl}"`, {
    encoding: "utf-8",
    timeout: 30_000,
  }).trim();
}

export function runMutation(name: string, args: Record<string, unknown> = {}): string {
  const argsJson = JSON.stringify(args);
  return runConvexCommand(`run "${name}" '${argsJson}'`);
}

export function clearAll(): void {
  runMutation("testing:clearAll");
}

export function seedUser(name = "E2E User"): TestUser {
  const result = runMutation("testing:seedUser", { name });
  const parsed = JSON.parse(result);
  return { ...parsed, name };
}

/** Insert N empty pubs directly (bypasses HTTP rate limiter). */
export function seedPubs(userId: string, count: number, slugPrefix: string): void {
  runMutation("testing:seedPubs", { userId, count, slugPrefix });
}

/** Create an extra API key for an existing user. Returns a TestUser with the new key. */
export function seedExtraApiKey(base: TestUser): TestUser {
  const result = runMutation("testing:seedExtraApiKey", { userId: base.userId });
  const parsed = JSON.parse(result);
  return { ...base, apiKey: parsed.apiKey, apiKeyId: parsed.apiKeyId };
}
