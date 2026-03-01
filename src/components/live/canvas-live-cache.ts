const CANVAS_CACHE_KEY_PREFIX = "pubblue:live:canvas:";
const MAX_CACHED_CANVAS_HTML_BYTES = 500_000;

function getCanvasCacheKey(slug: string): string {
  return `${CANVAS_CACHE_KEY_PREFIX}${slug}`;
}

export function readCachedCanvasHtml(slug: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(getCanvasCacheKey(slug));
    return value && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

export function writeCachedCanvasHtml(slug: string, html: string | null): void {
  if (typeof window === "undefined") return;
  const key = getCanvasCacheKey(slug);

  try {
    if (!html || html.length === 0 || html.length > MAX_CACHED_CANVAS_HTML_BYTES) {
      window.localStorage.removeItem(key);
      return;
    }
    window.localStorage.setItem(key, html);
  } catch {
    // Ignore local storage write failures (quota/private mode).
  }
}
