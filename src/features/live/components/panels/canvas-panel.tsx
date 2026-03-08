import { useEffect, useRef, useState } from "react";
import type {
  CanvasBridgeInboundMessage,
  CanvasBridgeOutboundMessage,
  LiveAnimationStyle,
  LiveRenderErrorPayload,
  LiveVisualState,
} from "~/features/live/types/live-types";
import { buildCanvasSrcDoc } from "~/features/live/utils/build-canvas-srcdoc";
import { cn } from "~/lib/utils";
import { CanvasLiveVisual } from "./canvas-live-visual";

interface CanvasPanelProps {
  animationStyle: LiveAnimationStyle;
  html: string | null;
  onCanvasBridgeMessage?: (message: CanvasBridgeInboundMessage) => void;
  onRenderError?: (error: LiveRenderErrorPayload) => void;
  outboundCanvasBridgeMessage?: CanvasBridgeOutboundMessage | null;
  visualState: LiveVisualState;
}

type VisualPhase = "visible" | "fading" | "hidden";
const RENDER_ERROR_REPORT_DEDUPE_MS = 2_500;

export function CanvasPanel({
  animationStyle,
  html,
  onCanvasBridgeMessage,
  onRenderError,
  outboundCanvasBridgeMessage,
  visualState,
}: CanvasPanelProps) {
  const [loadedHtml, setLoadedHtml] = useState<string | null>(null);
  const [visualPhase, setVisualPhase] = useState<VisualPhase>("visible");
  const [canvasError, setCanvasError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const lastReportedErrorRef = useRef<{ key: string; timestamp: number } | null>(null);
  const hasVisibleCanvasContent = Boolean(html && loadedHtml === html);

  useEffect(() => {
    if (!html) setCanvasError(null);
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
      if (event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data as
        | {
            colno?: number;
            filename?: string;
            lineno?: number;
            message?: string;
            [key: string]: unknown;
            source?: string;
            type?: string;
          }
        | undefined;
      if (!data || data.source !== "pubblue-canvas") return;
      if (
        data.type !== "error" &&
        data.type !== "command.bind" &&
        data.type !== "command.invoke" &&
        data.type !== "command.cancel"
      ) {
        return;
      }

      if (data.type !== "error") {
        if (!onCanvasBridgeMessage) return;
        const payload: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(data)) {
          if (key === "source" || key === "type") continue;
          payload[key] = value;
        }
        onCanvasBridgeMessage({
          type: data.type,
          payload,
        });
        return;
      }

      const message = typeof data.message === "string" ? data.message : "Canvas script error";
      const lineInfo =
        typeof data.lineno === "number" && data.lineno > 0
          ? ` (line ${data.lineno}${typeof data.colno === "number" && data.colno > 0 ? `:${data.colno}` : ""})`
          : "";
      setCanvasError(`${message}${lineInfo}`);

      if (!onRenderError) return;
      const keyParts = [
        message,
        typeof data.filename === "string" ? data.filename : "",
        typeof data.lineno === "number" ? String(data.lineno) : "",
        typeof data.colno === "number" ? String(data.colno) : "",
      ];
      const key = keyParts.join("|");
      const now = Date.now();
      const last = lastReportedErrorRef.current;
      if (last && last.key === key && now - last.timestamp < RENDER_ERROR_REPORT_DEDUPE_MS) return;
      lastReportedErrorRef.current = { key, timestamp: now };
      onRenderError({
        message,
        filename: typeof data.filename === "string" ? data.filename : undefined,
        lineno: typeof data.lineno === "number" ? data.lineno : undefined,
        colno: typeof data.colno === "number" ? data.colno : undefined,
      });
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [onCanvasBridgeMessage, onRenderError]);

  useEffect(() => {
    if (!outboundCanvasBridgeMessage) return;
    const frame = iframeRef.current?.contentWindow;
    if (!frame) return;
    frame.postMessage(
      {
        source: "pubblue-parent",
        type: outboundCanvasBridgeMessage.type,
        ...outboundCanvasBridgeMessage.payload,
      },
      "*",
    );
  }, [outboundCanvasBridgeMessage]);

  return (
    <div className="absolute inset-0 overflow-hidden bg-background">
      {html ? (
        <iframe
          key={html}
          ref={iframeRef}
          srcDoc={buildCanvasSrcDoc(html)}
          sandbox="allow-scripts allow-popups allow-forms allow-downloads"
          className={cn(
            "absolute inset-0 h-full w-full border-none transition-opacity duration-500 pointer-events-auto touch-auto",
            loadedHtml === html ? "opacity-100" : "opacity-0",
          )}
          title="Canvas"
          onLoad={() => setLoadedHtml(html)}
        />
      ) : null}
      {canvasError ? (
        <div className="pointer-events-none absolute left-1/2 top-4 z-10 -translate-x-1/2">
          <p className="rounded-full border border-destructive/40 bg-background/90 px-3 py-1 text-xs text-destructive shadow-sm backdrop-blur">
            {canvasError}
          </p>
        </div>
      ) : null}
      {visualPhase === "hidden" ? null : (
        <CanvasLiveVisual
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
