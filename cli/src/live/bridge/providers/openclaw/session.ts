import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { errorMessage } from "../../../../core/errors/cli-error.js";
import { resolveOpenClawStateDir } from "./paths.js";

export { resolveOpenClawHome, resolveOpenClawStateDir } from "./paths.js";

const OPENCLAW_MAIN_SESSION_KEY = "agent:main:main";

export function resolveOpenClawSessionsPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(resolveOpenClawStateDir(env), "agents", "main", "sessions", "sessions.json");
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
  readError?: string;
  sessionId: string | null;
}

export function resolveMainSessionFromOpenClaw(
  env: NodeJS.ProcessEnv = process.env,
): SessionResolution {
  try {
    const sessionsPath = resolveOpenClawSessionsPath(env);
    if (!existsSync(sessionsPath)) {
      return {
        readError: `sessions.json does not exist at ${sessionsPath}`,
        sessionId: null,
      };
    }
    const sessionsData = JSON.parse(readFileSync(sessionsPath, "utf-8")) as unknown;
    const sessions = readSessionsIndex(sessionsData);
    const mainSessionId = readSessionIdFromEntry(sessions[OPENCLAW_MAIN_SESSION_KEY]);
    if (mainSessionId) {
      return { sessionId: mainSessionId };
    }
    return { sessionId: null };
  } catch (error) {
    return {
      readError: errorMessage(error),
      sessionId: null,
    };
  }
}
