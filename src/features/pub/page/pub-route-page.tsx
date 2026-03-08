import { useMutation, useQuery } from "convex/react";
import { CanvasPanel } from "~/features/live/components/panels/canvas-panel";
import { SettingsPanel } from "~/features/live/components/panels/settings-panel";
import { useContentHtml } from "~/features/live/hooks/use-content-html";
import { ChatPanel } from "~/features/live-chat/components/chat-panel";
import { ControlBar } from "~/features/live-control-bar/components/control-bar";
import { usePubLiveModel } from "~/features/pub/hooks/use-pub-live-model";
import { usePubRouteController } from "~/features/pub/hooks/use-pub-route-controller";
import { api } from "../../../../convex/_generated/api";

export function PubRoutePage({ slug }: { slug: string }) {
  const pub = useQuery(api.pubs.getBySlug, { slug });
  const recordPublicView = useMutation(api.analytics.recordPublicView);
  const baseContentHtml = useContentHtml(pub?.content, pub?.contentType);
  const model = usePubLiveModel(slug);
  const controller = usePubRouteController({
    baseContentHtml,
    model,
    pub,
    recordPublicView,
    slug,
  });

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background text-foreground">
      {controller.liveMode && controller.controlBarCollapsed ? null : (
        <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-background/60 to-transparent pointer-events-none" />
      )}

      <div className="flex-1 min-h-0 relative">
        <div
          className={
            controller.viewMode === "canvas"
              ? "absolute inset-0"
              : "absolute inset-0 opacity-0 pointer-events-none"
          }
        >
          <CanvasPanel
            html={controller.effectiveCanvasHtml}
            onCanvasBridgeMessage={controller.onCanvasBridgeMessage}
            onRenderError={controller.onRenderError}
            outboundCanvasBridgeMessage={controller.outboundCanvasBridgeMessage}
            visualState={controller.canvasVisualState}
          />
        </div>

        {controller.liveMode && controller.viewMode === "chat" ? (
          <ChatPanel {...controller.chatPanelModel} />
        ) : null}

        {controller.liveMode && controller.viewMode === "settings" ? (
          <SettingsPanel
            model={controller.settingsPanelModel}
            actions={controller.settingsPanelActions}
          />
        ) : null}
      </div>

      {controller.isOwner ? (
        <ControlBar
          model={controller.controlBarModel}
          transport={controller.controlBarTransport}
          actions={controller.controlBarActions}
        />
      ) : null}
    </div>
  );
}
