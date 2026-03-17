import { useEffect, useRef, useState } from "react";
import { parseCanvasBridgeInboundMessage } from "~/features/live/types/live-command-types";
import type {
  CanvasBridgeCommandMessage,
  CanvasBridgeOutboundMessage,
  LiveRenderErrorPayload,
  LiveVisualState,
} from "~/features/live/types/live-types";
import { buildCanvasSrcDoc } from "~/features/live/utils/build-canvas-srcdoc";
import { cn } from "~/lib/utils";
import { CanvasLiveVisual } from "./canvas-live-visual";

interface CanvasPanelProps {
  html: string | null;
  onCanvasBridgeMessage?: (message: CanvasBridgeCommandMessage) => void;
  onRenderError?: (error: LiveRenderErrorPayload) => void;
  outboundCanvasBridgeMessage?: CanvasBridgeOutboundMessage | null;
  visualState: LiveVisualState;
}

type VisualPhase = "visible" | "fading" | "hidden";
const RENDER_ERROR_REPORT_DEDUPE_MS = 2_500;

function reportDedupedRenderError(
  key: string,
  payload: LiveRenderErrorPayload,
  ref: React.RefObject<{ key: string; timestamp: number } | null>,
  cb?: (error: LiveRenderErrorPayload) => void,
) {
  const now = Date.now();
  const last = ref.current;
  if (last && last.key === key && now - last.timestamp < RENDER_ERROR_REPORT_DEDUPE_MS) return;
  ref.current = { key, timestamp: now };
  cb?.(payload);
}

export function CanvasPanel({
  html,
  onCanvasBridgeMessage,
  onRenderError,
  outboundCanvasBridgeMessage,
  visualState,
}: CanvasPanelProps) {
  const [loadedHtml, setLoadedHtml] = useState<string | null>(null);
  const [visualPhase, setVisualPhase] = useState<VisualPhase>("visible");
  const [canvasBridgeReady, setCanvasBridgeReady] = useState(false);
  const [pendingOutboundCanvasBridgeMessages, setPendingOutboundCanvasBridgeMessages] = useState<
    CanvasBridgeOutboundMessage[]
  >([]);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const latestOutboundCanvasBridgeMessageRef = useRef<CanvasBridgeOutboundMessage | null>(
    outboundCanvasBridgeMessage ?? null,
  );
  const lastAcceptedOutboundMessageRef = useRef<CanvasBridgeOutboundMessage | null>(null);
  const lastReportedErrorRef = useRef<{ key: string; timestamp: number } | null>(null);
  const hasVisibleCanvasContent = Boolean(html && loadedHtml === html);
  latestOutboundCanvasBridgeMessageRef.current = outboundCanvasBridgeMessage ?? null;

  useEffect(() => {
    console.debug("[canvas] html-effect reset bridgeReady=false");
    setCanvasBridgeReady(false);
    setPendingOutboundCanvasBridgeMessages([]);
    lastAcceptedOutboundMessageRef.current = latestOutboundCanvasBridgeMessageRef.current;
    lastReportedErrorRef.current = null;
    if (!html) {
      setLoadedHtml(null);
    }
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
      const message = parseCanvasBridgeInboundMessage(event.data);
      if (!message) return;

      if (message.type === "ready") {
        console.debug("[canvas] ready msg → bridgeReady=true");
        setCanvasBridgeReady(true);
        return;
      }

      if (message.type === "console-error") {
        reportDedupedRenderError(
          message.payload.message,
          { message: `[console.error] ${message.payload.message}` },
          lastReportedErrorRef,
          onRenderError,
        );
        return;
      }

      if (message.type === "error") {
        const { message: errorMessage, filename, lineno, colno } = message.payload;
        const keyParts = [
          errorMessage,
          filename ?? "",
          typeof lineno === "number" ? String(lineno) : "",
          typeof colno === "number" ? String(colno) : "",
        ];
        reportDedupedRenderError(
          keyParts.join("|"),
          { message: errorMessage, filename, lineno, colno },
          lastReportedErrorRef,
          onRenderError,
        );
        return;
      }

      onCanvasBridgeMessage?.(message);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [onCanvasBridgeMessage, onRenderError]);

  useEffect(() => {
    if (!outboundCanvasBridgeMessage) return;
    if (lastAcceptedOutboundMessageRef.current === outboundCanvasBridgeMessage) return;
    lastAcceptedOutboundMessageRef.current = outboundCanvasBridgeMessage;
    setPendingOutboundCanvasBridgeMessages((current) => [...current, outboundCanvasBridgeMessage]);
  }, [outboundCanvasBridgeMessage]);

  useEffect(() => {
    if (!canvasBridgeReady || pendingOutboundCanvasBridgeMessages.length === 0) {
      if (pendingOutboundCanvasBridgeMessages.length > 0) {
        console.debug(
          "[canvas] BLOCKED pending=%d bridgeReady=%s",
          pendingOutboundCanvasBridgeMessages.length,
          canvasBridgeReady,
        );
      }
      return;
    }
    const frame = iframeRef.current?.contentWindow;
    if (!frame) return;
    console.debug("[canvas] posting to iframe", pendingOutboundCanvasBridgeMessages[0].type);
    frame.postMessage(pendingOutboundCanvasBridgeMessages[0], "*");
    setPendingOutboundCanvasBridgeMessages((current) => current.slice(1));
  }, [canvasBridgeReady, pendingOutboundCanvasBridgeMessages]);

  return (
    <div className="absolute inset-0 overflow-hidden bg-background">
      {html ? (
        <iframe
          key={html}
          ref={iframeRef}
          srcDoc={buildCanvasSrcDoc(html)}
          sandbox="allow-scripts allow-popups allow-forms allow-downloads allow-pointer-lock"
          className={cn(
            "absolute inset-0 h-full w-full border-none transition-opacity duration-500 pointer-events-auto touch-auto",
            loadedHtml === html ? "opacity-100" : "opacity-0",
          )}
          title="Canvas"
          onLoad={() => {
            console.debug("[canvas] onLoad");
            setLoadedHtml(html);
          }}
        />
      ) : null}
      {visualPhase === "hidden" ? null : (
        <CanvasLiveVisual
          className="absolute inset-0"
          fadeOut={visualPhase === "fading"}
          hasCanvasContent={hasVisibleCanvasContent}
          state={visualState}
        />
      )}
    </div>
  );
}
