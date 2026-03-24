import {
  CROSS_ORIGIN_SANDBOX_ATTR,
  IFRAME_ALLOW_ATTR,
  SRCDOC_SANDBOX_ATTR,
} from "@shared/sandbox-policy-core";
import { useEffect, useRef, useState } from "react";
import type { BlobTone } from "~/components/blob/blob-tone";
import {
  PARENT_TO_CANVAS_SOURCE,
  parseCanvasBridgeInboundMessage,
} from "~/features/live/types/live-command-types";
import type {
  CanvasBridgeCommandMessage,
  CanvasBridgeOutboundMessage,
  LiveRenderErrorPayload,
} from "~/features/live/types/live-types";
import { buildCanvasSrcDoc } from "~/features/live/utils/build-canvas-srcdoc";
import { cn } from "~/lib/utils";
import { CanvasLiveBlob } from "./canvas-live-blob";

const SANDBOX_SOURCE = "pub-sandbox";

interface CanvasPanelProps {
  html: string | null;
  capturePreview?: boolean;
  onCanvasBridgeMessage?: (message: CanvasBridgeCommandMessage) => void;
  onPreviewCaptured?: (html: string) => void;
  onRenderError?: (error: LiveRenderErrorPayload) => void;
  outboundCanvasBridgeMessage?: CanvasBridgeOutboundMessage | null;
  blobTone: BlobTone;
  /** When set, use sandbox iframe (SW mode) instead of srcdoc. */
  sandboxUrl?: string | null;
  /** Callback to set the iframe's contentWindow for pub-fs bridge. */
  onIframeWindow?: (win: Window | null) => void;
  /** When false, delay sandbox HTML injection until the parent relay is ready. */
  sandboxContentReady?: boolean;
}

type BlobPhase = "visible" | "fading" | "hidden";
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
  capturePreview,
  onCanvasBridgeMessage,
  onPreviewCaptured,
  onRenderError,
  outboundCanvasBridgeMessage,
  blobTone,
  sandboxUrl,
  onIframeWindow,
  sandboxContentReady = true,
}: CanvasPanelProps) {
  const [loadedHtml, setLoadedHtml] = useState<string | null>(null);
  const [blobPhase, setBlobPhase] = useState<BlobPhase>("visible");
  const [canvasBridgeReady, setCanvasBridgeReady] = useState(false);
  const [sandboxReady, setSandboxReady] = useState(false);
  const [pendingOutboundCanvasBridgeMessages, setPendingOutboundCanvasBridgeMessages] = useState<
    CanvasBridgeOutboundMessage[]
  >([]);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const latestOutboundCanvasBridgeMessageRef = useRef<CanvasBridgeOutboundMessage | null>(
    outboundCanvasBridgeMessage ?? null,
  );
  const lastAcceptedOutboundMessageRef = useRef<CanvasBridgeOutboundMessage | null>(null);
  const lastReportedErrorRef = useRef<{ key: string; timestamp: number } | null>(null);
  const sandboxMode = Boolean(sandboxUrl);
  const hasVisibleCanvasContent = Boolean(html && loadedHtml === html);
  latestOutboundCanvasBridgeMessageRef.current = outboundCanvasBridgeMessage ?? null;

  // biome-ignore lint/correctness/useExhaustiveDependencies: html changes reset content-dependent state
  useEffect(() => {
    setCanvasBridgeReady(false);
    setPendingOutboundCanvasBridgeMessages([]);
    lastAcceptedOutboundMessageRef.current = latestOutboundCanvasBridgeMessageRef.current;
    lastReportedErrorRef.current = null;
    if (!html) {
      setLoadedHtml(null);
    }
  }, [html]);

  // sandboxReady tracks the iframe's SW lifecycle — reset only when the iframe is recreated.
  // Also reset canvasBridgeReady since the new iframe has no bridge yet.
  // biome-ignore lint/correctness/useExhaustiveDependencies: sandboxUrl changes require iframe-level reset
  useEffect(() => {
    setSandboxReady(false);
    setCanvasBridgeReady(false);
  }, [sandboxUrl]);

  useEffect(() => {
    if (!hasVisibleCanvasContent) {
      setBlobPhase("visible");
      return;
    }
    setBlobPhase("fading");
    const timer = setTimeout(() => setBlobPhase("hidden"), 420);
    return () => clearTimeout(timer);
  }, [hasVisibleCanvasContent]);

  // Expose iframe window for pub-fs bridge
  // biome-ignore lint/correctness/useExhaustiveDependencies: sandboxReady signals iframe is available
  useEffect(() => {
    if (sandboxMode && iframeRef.current?.contentWindow) {
      onIframeWindow?.(iframeRef.current.contentWindow);
    }
    return () => onIframeWindow?.(null);
  }, [sandboxMode, onIframeWindow, sandboxReady]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;

      // Handle sandbox-ready signal (SW mode only)
      if (
        sandboxMode &&
        event.data?.type === "sandbox-ready" &&
        event.data?.source === SANDBOX_SOURCE
      ) {
        setSandboxReady(true);
        return;
      }

      const message = parseCanvasBridgeInboundMessage(event.data);
      if (!message) return;

      if (message.type === "ready") {
        setCanvasBridgeReady(true);
        return;
      }

      if (message.type === "preview.captured") {
        onPreviewCaptured?.(message.payload.html);
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
  }, [onCanvasBridgeMessage, onPreviewCaptured, onRenderError, sandboxMode]);

  // Inject content into sandbox iframe once it's ready
  useEffect(() => {
    if (!sandboxMode || !sandboxReady || !sandboxContentReady || !html) return;
    const frame = iframeRef.current?.contentWindow;
    if (!frame) return;
    const injectedHtml = buildCanvasSrcDoc(html);
    frame.postMessage(
      { type: "inject-content", source: PARENT_TO_CANVAS_SOURCE, html: injectedHtml },
      "*",
    );
    setLoadedHtml(html);
  }, [sandboxMode, sandboxReady, sandboxContentReady, html]);

  useEffect(() => {
    if (!capturePreview || !canvasBridgeReady) return;
    const frame = iframeRef.current?.contentWindow;
    if (!frame) return;
    frame.postMessage({ source: PARENT_TO_CANVAS_SOURCE, type: "preview.capture" }, "*");
  }, [capturePreview, canvasBridgeReady]);

  useEffect(() => {
    if (!outboundCanvasBridgeMessage) return;
    if (lastAcceptedOutboundMessageRef.current === outboundCanvasBridgeMessage) return;
    lastAcceptedOutboundMessageRef.current = outboundCanvasBridgeMessage;
    setPendingOutboundCanvasBridgeMessages((current) => [...current, outboundCanvasBridgeMessage]);
  }, [outboundCanvasBridgeMessage]);

  useEffect(() => {
    if (!canvasBridgeReady || pendingOutboundCanvasBridgeMessages.length === 0) {
      return;
    }
    const frame = iframeRef.current?.contentWindow;
    if (!frame) return;
    frame.postMessage(pendingOutboundCanvasBridgeMessages[0], "*");
    setPendingOutboundCanvasBridgeMessages((current) => current.slice(1));
  }, [canvasBridgeReady, pendingOutboundCanvasBridgeMessages]);

  return (
    <div className="absolute inset-0 overflow-hidden bg-background">
      {html ? (
        sandboxMode && sandboxUrl ? (
          <iframe
            key={sandboxUrl}
            ref={iframeRef}
            src={sandboxUrl}
            sandbox={CROSS_ORIGIN_SANDBOX_ATTR}
            allow={IFRAME_ALLOW_ATTR}
            className={cn(
              "absolute inset-0 h-full w-full border-none transition-opacity duration-500 pointer-events-auto touch-auto",
              loadedHtml === html ? "opacity-100" : "opacity-0",
            )}
            title="Canvas"
          />
        ) : (
          <iframe
            key={html}
            ref={iframeRef}
            srcDoc={buildCanvasSrcDoc(html)}
            sandbox={SRCDOC_SANDBOX_ATTR}
            allow={IFRAME_ALLOW_ATTR}
            className={cn(
              "absolute inset-0 h-full w-full border-none transition-opacity duration-500 pointer-events-auto touch-auto",
              loadedHtml === html ? "opacity-100" : "opacity-0",
            )}
            title="Canvas"
            onLoad={() => setLoadedHtml(html)}
          />
        )
      ) : null}
      {blobPhase === "hidden" ? null : (
        <CanvasLiveBlob
          className="absolute inset-0"
          fadeOut={blobPhase === "fading"}
          hasCanvasContent={hasVisibleCanvasContent}
          tone={blobTone}
        />
      )}
    </div>
  );
}
