import { api } from "@backend/_generated/api";
import { useQuery } from "convex/react";
import { ControlBarProvider } from "~/components/control-bar/control-bar-controller";
import { createLiveBlobPresentation } from "~/features/live/blob/live-blob-presentation";
import { CanvasPanel } from "~/features/live/components/panels/canvas-panel";
import { SettingsPanel } from "~/features/live/components/panels/settings-panel";
import { useContentHtml } from "~/features/live/hooks/use-content-html";
import { ChatPanel } from "~/features/live-chat/components/chat-panel";
import { ControlBar } from "~/features/live-control-bar/components/control-bar";
import { FullscreenPromptLayer } from "~/features/live-control-bar/components/fullscreen-prompt-layer";
import { usePreviewCapture } from "~/features/preview-capture/use-preview-capture";
import type { UsePubLiveModelOptions } from "~/features/pub/hooks/use-pub-live-model";
import { useDeveloperMode } from "~/hooks/use-developer-mode";
import { LiveSessionProvider, useLiveSession } from "../contexts/live-session-context";
import { PubSourceView } from "./pub-source-view";

export function PubRoutePage({ slug, showSource }: { slug: string; showSource?: boolean }) {
  const pub = useQuery(api.pubs.getBySlug, { slug });
  const { developerModeEnabled } = useDeveloperMode();
  const { html: baseContentHtml, status: contentState } = useContentHtml(pub?.content, {
    loading: pub === undefined,
  });

  if (showSource && developerModeEnabled && pub) {
    return <PubSourceView slug={slug} title={pub.title} content={pub.content} />;
  }

  return (
    <LiveSessionProvider
      slug={slug}
      pub={pub}
      baseContentHtml={baseContentHtml}
      contentState={contentState}
    >
      <PubRouteContent slug={slug} pub={pub} baseContentHtml={baseContentHtml} />
    </LiveSessionProvider>
  );
}

function PubRouteContent({
  slug,
  pub,
  baseContentHtml,
}: {
  slug: string;
  pub:
    | (UsePubLiveModelOptions["pub"] & {
        updatedAt?: number;
        previewHtml?: string;
        fileCount?: number;
      })
    | null
    | undefined;
  baseContentHtml: string | null;
}) {
  const session = useLiveSession();

  const isOwner = pub?.isOwner === true;
  const liveMode = isOwner;
  const viewMode = liveMode ? session.viewMode : "canvas";
  const effectiveCanvasHtml = liveMode ? (session.canvasHtml ?? null) : (baseContentHtml ?? null);
  const liveBlob = createLiveBlobPresentation(session.blobState);

  const { capturePreview, handlePreviewCaptured } = usePreviewCapture({
    slug,
    liveMode,
    command: session.command,
    hasCanvasContent: session.hasCanvasContent,
    pubUpdatedAt: pub?.updatedAt,
    hasPreviewHtml: !!pub?.previewHtml,
  });

  return (
    <ControlBarProvider>
      <div className="pub-overlay fixed inset-0 z-50 flex flex-col bg-background text-foreground">
        {liveMode && session.controlBarCollapsed ? null : session.hasCanvasContent ? (
          <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-background/60 to-transparent pointer-events-none" />
        ) : null}

        <div className="flex-1 min-h-0 relative">
          <div
            className={
              viewMode === "canvas"
                ? "absolute inset-0"
                : "absolute inset-0 opacity-0 pointer-events-none"
            }
          >
            <CanvasPanel
              html={effectiveCanvasHtml}
              contentBaseUrl={session.contentBaseUrl}
              capturePreview={capturePreview}
              onCanvasBridgeMessage={session.onCanvasBridgeMessage}
              onPreviewCaptured={isOwner ? handlePreviewCaptured : undefined}
              onRenderError={isOwner ? session.handleRenderError : undefined}
              outboundCanvasBridgeMessage={session.outboundCanvasBridgeMessage}
              blobTone={liveBlob.tone}
              sandboxUrl={session.sandboxUrl}
              onIframeWindow={isOwner ? session.onIframeWindow : undefined}
              sandboxContentReady={
                session.contentBaseUrl !== null &&
                (isOwner
                  ? !session.liveRequested && !session.hasCommandManifest
                    ? true
                    : session.pubFsBridgeReady
                  : true)
              }
            />
          </div>

          {liveMode && viewMode === "chat" ? <ChatPanel /> : null}

          {liveMode && viewMode === "settings" ? <SettingsPanel /> : null}
        </div>

        {isOwner ? (
          <>
            {/* Must render before ControlBar so its layer sits below the transient layer */}
            <FullscreenPromptLayer slug={slug} />
            <ControlBar
              shellTone={liveBlob.controlBarTone}
              statusButtonContent={liveBlob.statusButtonContent}
            />
          </>
        ) : null}
      </div>
    </ControlBarProvider>
  );
}
