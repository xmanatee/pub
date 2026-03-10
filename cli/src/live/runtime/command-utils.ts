import { PubApiError } from "../../core/api/client.js";
import { errorMessage } from "../../core/errors/cli-error.js";

export function getFollowReadDelayMs(disconnected: boolean, consecutiveFailures: number): number {
  if (!disconnected) return 1_000;
  return Math.min(5_000, 1_000 * 2 ** Math.min(consecutiveFailures, 3));
}

export function messageContainsPong(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const message = (payload as { msg?: unknown }).msg;
  if (!message || typeof message !== "object") return false;
  const type = (message as { type?: unknown }).type;
  const data = (message as { data?: unknown }).data;
  return type === "text" && typeof data === "string" && data.trim().toLowerCase() === "pong";
}

export function formatApiError(error: unknown): string {
  if (error instanceof PubApiError) {
    if (error.status === 429 && error.retryAfterSeconds !== undefined) {
      return `Rate limit exceeded. Retry after ${error.retryAfterSeconds}s.`;
    }
    return `${error.message} (HTTP ${error.status})`;
  }
  return errorMessage(error);
}
