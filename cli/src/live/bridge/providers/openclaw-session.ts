import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { errorMessage } from "../../../core/errors/cli-error.js";
import type { BridgeSessionSource } from "../types.js";
import { resolveOpenClawStateDir } from "./openclaw-paths.js";

export { resolveOpenClawHome, resolveOpenClawStateDir } from "./openclaw-paths.js";

const OPENCLAW_MAIN_SESSION_KEY = "agent:main:main";

export function resolveOpenClawSessionsPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(resolveOpenClawStateDir(env), "agents", "main", "sessions", "sessions.json");
}

function buildThreadCandidateKeys(threadId?: string): string[] {
  const trimmed = threadId?.trim();
  if (!trimmed) return [];
  return [`agent:main:main:thread:${trimmed}`, `agent:main:${trimmed}`];
}

function readSessionIdFromEntry(entry: unknown): string | null {
  if (!entry || typeof entry !== "object") return null;
  const value = (entry as { sessionId?: unknown }).sessionId;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readSessionsIndex(sessionsData: unknown): Record<string, unknown> {
  if (!sessionsData || typeof sessionsData !== "object") return {};
  const root = sessionsData as { sessions?: unknown };
  if (root.sessions && typeof root.sessions === "object") {
    return root.sessions as Record<string, unknown>;
  }
  return sessionsData as Record<string, unknown>;
}

export interface SessionResolution {
  attemptedKeys: string[];
  readError?: string;
  sessionId: string | null;
  sessionKey?: string;
  sessionSource?: BridgeSessionSource;
}

export function resolveSessionFromSessionsData(
  sessionsData: unknown,
  threadId?: string,
): SessionResolution {
  const sessions = readSessionsIndex(sessionsData);
  const threadCandidates = buildThreadCandidateKeys(threadId);
  const attemptedKeys: string[] = [];

  for (const [index, key] of threadCandidates.entries()) {
    attemptedKeys.push(key);
    const sessionId = readSessionIdFromEntry(sessions[key]);
    if (sessionId) {
      return {
        attemptedKeys,
        sessionId,
        sessionKey: key,
        sessionSource: index === 0 ? "thread-canonical" : "thread-legacy",
      };
    }
  }

  attemptedKeys.push(OPENCLAW_MAIN_SESSION_KEY);
  const mainSessionId = readSessionIdFromEntry(sessions[OPENCLAW_MAIN_SESSION_KEY]);
  if (mainSessionId) {
    return {
      attemptedKeys,
      sessionId: mainSessionId,
      sessionKey: OPENCLAW_MAIN_SESSION_KEY,
      sessionSource: "main-fallback",
    };
  }

  return { attemptedKeys, sessionId: null };
}

export function resolveSessionFromOpenClaw(
  threadId?: string,
  env: NodeJS.ProcessEnv = process.env,
): SessionResolution {
  try {
    const sessionsPath = resolveOpenClawSessionsPath(env);
    if (!existsSync(sessionsPath)) {
      return {
        attemptedKeys: [...buildThreadCandidateKeys(threadId), OPENCLAW_MAIN_SESSION_KEY],
        readError: `sessions.json does not exist at ${sessionsPath}`,
        sessionId: null,
      };
    }
    const sessionsData = JSON.parse(readFileSync(sessionsPath, "utf-8")) as unknown;
    return resolveSessionFromSessionsData(sessionsData, threadId);
  } catch (error) {
    return {
      attemptedKeys: [...buildThreadCandidateKeys(threadId), OPENCLAW_MAIN_SESSION_KEY],
      readError: errorMessage(error),
      sessionId: null,
    };
  }
}
