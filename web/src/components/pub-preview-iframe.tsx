import * as React from "react";
import { getConvexSiteUrl } from "~/lib/convex-url";

export function buildServePreviewUrl(slug: string): string {
  return `${getConvexSiteUrl()}/serve/${slug}?preview=1`;
}

function parseSnapshot(data: unknown): string | null {
  if (typeof data !== "object" || data === null) return null;
  const msg = data as Record<string, unknown>;
  if (msg.source !== "pub-preview" || msg.type !== "snapshot") return null;
  if (typeof msg.html !== "string" || msg.html.length === 0) return null;
  return msg.html;
}

const OBSERVER_OPTIONS: IntersectionObserverInit = { rootMargin: "200px" };

interface PubPreviewIframeProps {
  slug: string;
  title: string;
  snapshot?: string;
  onSnapshot?: (slug: string, html: string) => void;
}

export function PubPreviewIframe({ slug, title, snapshot, onSnapshot }: PubPreviewIframeProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const iframeRef = React.useRef<HTMLIFrameElement>(null);
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      OBSERVER_OPTIONS,
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    if (snapshot || !visible || !onSnapshot) return;
    const callback = onSnapshot;

    function handleMessage(event: MessageEvent) {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const html = parseSnapshot(event.data);
      if (html) callback(slug, html);
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [snapshot, visible, onSnapshot, slug]);

  return (
    <div ref={containerRef} className="relative h-full w-full">
      {visible && !snapshot && (
        <iframe
          ref={iframeRef}
          src={buildServePreviewUrl(slug)}
          sandbox="allow-scripts"
          loading="eager"
          tabIndex={-1}
          title={title}
          className="h-full w-full border-none"
        />
      )}
      {snapshot && (
        <iframe
          srcDoc={snapshot}
          sandbox=""
          tabIndex={-1}
          title={title}
          className="h-full w-full border-none"
        />
      )}
      <div className="absolute inset-0" aria-hidden="true" />
    </div>
  );
}
