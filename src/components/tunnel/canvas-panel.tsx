import { useEffect, useState } from "react";
import { cn } from "~/lib/utils";
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
  const hasVisibleCanvasContent = Boolean(html && loadedHtml === html);

  useEffect(() => {
    if (!hasVisibleCanvasContent) {
      setVisualPhase("visible");
      return;
    }
    setVisualPhase("fading");
    const timer = setTimeout(() => setVisualPhase("hidden"), 420);
    return () => clearTimeout(timer);
  }, [hasVisibleCanvasContent]);

  return (
    <div className="absolute inset-0 overflow-hidden bg-background">
      {html ? (
        <iframe
          key={html}
          srcDoc={`<base target="_blank">${html}`}
          sandbox="allow-scripts allow-popups allow-forms allow-downloads"
          className={cn(
            "absolute inset-0 h-full w-full border-none transition-opacity duration-500",
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
