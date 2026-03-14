import { PubApiError } from "../../core/api/client.js";
import { errorMessage } from "../../core/errors/cli-error.js";

export function formatApiError(error: unknown): string {
  if (error instanceof PubApiError) {
    if (error.status === 429 && error.retryAfterSeconds !== undefined) {
      return `Rate limit exceeded. Retry after ${error.retryAfterSeconds}s.`;
    }
    return `${error.message} (HTTP ${error.status})`;
  }
  return errorMessage(error);
}
