import { useMemo } from "react";
import type { LiveContentState } from "~/features/live/types/live-types";

interface UseContentHtmlOptions {
  loading?: boolean;
}

export function useContentHtml(
  content: string | undefined,
  options?: UseContentHtmlOptions,
): {
  html: string | null;
  status: LiveContentState;
} {
  return useMemo(() => {
    if (options?.loading) return { html: null, status: "loading" as const };
    if (!content) return { html: null, status: "empty" as const };
    return { html: content, status: "ready" as const };
  }, [content, options?.loading]);
}
