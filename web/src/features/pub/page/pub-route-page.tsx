import { api } from "@backend/_generated/api";
import { useQuery } from "convex/react";
import { CanvasPanel } from "~/features/live/components/panels/canvas-panel";
import { SettingsPanel } from "~/features/live/components/panels/settings-panel";
import { useContentHtml } from "~/features/live/hooks/use-content-html";
import { ChatPanel } from "~/features/live-chat/components/chat-panel";
import { ControlBar } from "~/features/live-control-bar/components/control-bar";
import type { UsePubLiveModelOptions } from "~/features/pub/hooks/use-pub-live-model";
import { LiveSessionProvider, useLiveSession } from "../contexts/live-session-context";

export function PubRoutePage({ slug }: { slug: string }) {
  const pub = useQuery(api.pubs.getBySlug, { slug });
  const { html: baseContentHtml, status: contentState } = useContentHtml(pub?.content);

  return (
    <LiveSessionProvider
      slug={slug}
      pub={pub}
      baseContentHtml={baseContentHtml}
      contentState={contentState}
    >
      <PubRouteContent pub={pub} baseContentHtml={baseContentHtml} />
    </LiveSessionProvider>
  );
}

function PubRouteContent({
  pub,
  baseContentHtml,
}: {
  pub: UsePubLiveModelOptions["pub"];
  baseContentHtml: string | null;
}) {
  const session = useLiveSession();

  const isOwner = pub?.isOwner === true;
  const liveMode = isOwner;
  const viewMode = liveMode ? session.viewMode : "canvas";
  const effectiveCanvasHtml = liveMode ? (session.canvasHtml ?? null) : (baseContentHtml ?? null);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background text-foreground">
      {liveMode && session.controlBarCollapsed ? null : (
        <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-background/60 to-transparent pointer-events-none" />
      )}

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
            onCanvasBridgeMessage={isOwner ? session.onCanvasBridgeMessage : undefined}
            onCanvasErrorChange={isOwner ? session.setCanvasError : undefined}
            onRenderError={isOwner ? session.sendRenderError : undefined}
            outboundCanvasBridgeMessage={isOwner ? session.outboundCanvasBridgeMessage : null}
            visualState={session.visualState}
          />
        </div>

        {liveMode && viewMode === "chat" ? <ChatPanel /> : null}

        {liveMode && viewMode === "settings" ? <SettingsPanel /> : null}
      </div>

      {isOwner ? <ControlBar /> : null}
    </div>
  );
}
