import { useEffect, useState } from "react";
import { cn } from "~/lib/utils";
import { buildCanvasSrcDoc } from "./build-canvas-srcdoc";
import { CanvasSessionVisual } from "./canvas-session-visual";
import type { TunnelAnimationStyle, TunnelSessionVisualState } from "./types";

interface CanvasPanelProps {
  animationStyle: TunnelAnimationStyle;
  html: string | null;
  visualState: TunnelSessionVisualState;
}

type VisualPhase = "visible" | "fading" | "hidden";

export function CanvasPanel({ animationStyle, html, visualState }: CanvasPanelProps) {
  const [loadedHtml, setLoadedHtml] = useState<string | null>(null);
  const [visualPhase, setVisualPhase] = useState<VisualPhase>("visible");
  const [canvasError, setCanvasError] = useState<string | null>(null);
  const hasVisibleCanvasContent = Boolean(html && loadedHtml === html);

  useEffect(() => {
    if (!html) {
      setCanvasError(null);
      return;
    }
    setCanvasError(null);
  }, [html]);

  useEffect(() => {
    if (!hasVisibleCanvasContent) {
      setVisualPhase("visible");
      return;
    }
    setVisualPhase("fading");
    const timer = setTimeout(() => setVisualPhase("hidden"), 420);
    return () => clearTimeout(timer);
  }, [hasVisibleCanvasContent]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as
        | {
            colno?: number;
            filename?: string;
            lineno?: number;
            message?: string;
            source?: string;
            type?: string;
          }
        | undefined;
      if (!data || data.source !== "pubblue-canvas" || data.type !== "error") return;
      const message = typeof data.message === "string" ? data.message : "Canvas script error";
      const lineInfo =
        typeof data.lineno === "number" && data.lineno > 0
          ? ` (line ${data.lineno}${typeof data.colno === "number" && data.colno > 0 ? `:${data.colno}` : ""})`
          : "";
      setCanvasError(`${message}${lineInfo}`);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden bg-background">
      {html ? (
        <iframe
          key={html}
          srcDoc={buildCanvasSrcDoc(html)}
          sandbox="allow-scripts allow-popups allow-forms allow-downloads"
          className={cn(
            "absolute inset-0 h-full w-full border-none transition-opacity duration-500 pointer-events-auto touch-auto",
            loadedHtml === html ? "opacity-100" : "opacity-0",
          )}
          title="Canvas"
          onLoad={() => setLoadedHtml(html)}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center px-6">
          <p className="rounded-full border border-border/60 bg-background/70 px-4 py-2 text-center text-xs text-muted-foreground backdrop-blur-md">
            Waiting for content from the agent...
          </p>
        </div>
      )}
      {canvasError ? (
        <div className="pointer-events-none absolute left-1/2 top-4 z-10 -translate-x-1/2">
          <p className="rounded-full border border-destructive/40 bg-background/90 px-3 py-1 text-xs text-destructive shadow-sm backdrop-blur">
            {canvasError}
          </p>
        </div>
      ) : null}
      {visualPhase === "hidden" ? null : (
        <CanvasSessionVisual
          className="absolute inset-0"
          fadeOut={visualPhase === "fading"}
          hasCanvasContent={hasVisibleCanvasContent}
          state={visualState}
          styleType={animationStyle}
        />
      )}
    </div>
  );
}
