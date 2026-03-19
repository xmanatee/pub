import * as React from "react";

const OBSERVER_OPTIONS: IntersectionObserverInit = { rootMargin: "200px" };

interface PubPreviewIframeProps {
  previewHtml: string;
  title: string;
}

export function PubPreviewIframe({ previewHtml, title }: PubPreviewIframeProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
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

  return (
    <div ref={containerRef} className="relative h-full w-full">
      {visible && (
        <iframe
          srcDoc={previewHtml}
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
