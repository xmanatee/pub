import { useMemo } from "react";
import type { LiveContentState } from "~/features/live/types/live-types";

export function useContentHtml(content: string | undefined): {
  html: string | null;
  status: LiveContentState;
} {
  return useMemo(() => {
    if (!content) return { html: null, status: "empty" as const };
    return { html: content, status: "ready" as const };
  }, [content]);
}
