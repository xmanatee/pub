import { useEffect, useState } from "react";
import type { LiveContentState } from "~/features/live/types/live-types";
import { escapeHtml } from "~/lib/pub-preview";

const MARKDOWN_STYLES = `
  body { max-width: 48rem; margin: 0 auto; padding: 3rem 2rem; font-family: system-ui, sans-serif; line-height: 1.7; color: #e4e4e7; background: #09090b; }
  a { color: #a78bfa; }
  pre { background: #18181b; padding: 1rem; border-radius: 0.5rem; overflow-x: auto; }
  code { font-size: 0.875em; }
  img { max-width: 100%; height: auto; }
  blockquote { border-left: 3px solid #3f3f46; margin-left: 0; padding-left: 1rem; color: #a1a1aa; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #27272a; padding: 0.5rem 0.75rem; text-align: left; }
  h1, h2, h3, h4, h5, h6 { line-height: 1.3; }
  hr { border: none; border-top: 1px solid #27272a; margin: 2rem 0; }
`;

const TEXT_STYLES = `
  body { margin: 0; padding: 1.5rem; background: #09090b; color: #e4e4e7; }
  pre { font-family: ui-monospace, monospace; font-size: 0.875rem; white-space: pre-wrap; line-height: 1.6; margin: 0; }
`;

function wrapInDocument(body: string, styles: string): string {
  return `<!doctype html><html><head><style>${styles}</style></head><body>${body}</body></html>`;
}

export function useContentHtml(
  content: string | undefined,
  contentType: string | undefined,
): { html: string | null; status: LiveContentState } {
  const [html, setHtml] = useState<string | null>(null);
  const [status, setStatus] = useState<LiveContentState>("empty");

  useEffect(() => {
    if (!content || !contentType) {
      setHtml(null);
      setStatus("empty");
      return;
    }

    if (contentType === "html") {
      setHtml(content);
      setStatus("ready");
      return;
    }

    if (contentType === "text") {
      const escaped = escapeHtml(content);
      setHtml(wrapInDocument(`<pre>${escaped}</pre>`, TEXT_STYLES));
      setStatus("ready");
      return;
    }

    if (contentType === "markdown") {
      let cancelled = false;
      setStatus("loading");
      void import("marked").then(({ marked }) => {
        void Promise.resolve(marked.parse(content)).then((parsed) => {
          if (!cancelled) {
            setHtml(wrapInDocument(parsed, MARKDOWN_STYLES));
            setStatus("ready");
          }
        });
      });
      return () => {
        cancelled = true;
      };
    }

    setHtml(null);
    setStatus("empty");
  }, [content, contentType]);

  return { html, status };
}
