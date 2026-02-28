import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useConvexAuth } from "convex/react";
import { useEffect } from "react";
import { CanvasPanel } from "~/components/tunnel/canvas-panel";
import { ChatPanel } from "~/components/tunnel/chat-panel";
import { ControlBar } from "~/components/tunnel/control-bar";
import { SettingsPanel } from "~/components/tunnel/settings-panel";
import { useTunnelPageModel } from "~/components/tunnel/use-tunnel-page-model";

export const Route = createFileRoute("/t/$tunnelId")({
  component: TunnelPage,
});

function TunnelPage() {
  const { tunnelId } = Route.useParams();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) void navigate({ to: "/login" });
  }, [isLoading, isAuthenticated, navigate]);

  if (isLoading) return <StatusScreen text="Checking authentication..." />;
  if (!isAuthenticated) return <StatusScreen text="Redirecting to login..." />;
  return <TunnelPageInner tunnelId={tunnelId} />;
}

function TunnelPageInner({ tunnelId }: { tunnelId: string }) {
  const model = useTunnelPageModel(tunnelId);

  if (model.tunnel === undefined) return <StatusScreen text="Loading..." />;
  if (model.tunnel === null) return <StatusScreen text="Tunnel not found or expired." />;
  if (!model.tunnel.agentOffer && !model.canvasHtml)
    return <StatusScreen text="Waiting for agent..." />;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background text-foreground">
      <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-background/60 to-transparent pointer-events-none" />
      <div className="flex-1 min-h-0 relative">
        {model.viewMode === "canvas" ? (
          <CanvasPanel
            animationStyle={model.animationStyle}
            html={model.canvasHtml}
            visualState={model.visualState}
          />
        ) : null}

        {model.viewMode === "chat" ? (
          <ChatPanel
            files={model.files}
            messages={model.messages}
            messagesEndRef={model.messagesEndRef}
            showDeliveryStatus={model.showDeliveryStatus}
          />
        ) : null}

        {model.viewMode === "settings" ? (
          <SettingsPanel
            autoOpenCanvas={model.autoOpenCanvas}
            animationStyle={model.animationStyle}
            fileCount={model.files.length}
            hasCanvasContent={Boolean(model.canvasHtml)}
            messageCount={model.messages.length}
            onAutoOpenCanvasChange={model.setAutoOpenCanvas}
            onAnimationStyleChange={model.setAnimationStyle}
            onClearCanvas={model.clearCanvas}
            onClearFiles={model.clearFiles}
            onClearMessages={model.clearMessages}
            onShowDeliveryStatusChange={model.setShowDeliveryStatus}
            showDeliveryStatus={model.showDeliveryStatus}
          />
        ) : null}
      </div>

      <ControlBar
        disabled={!model.connected}
        bridge={model.bridgeRef.current}
        onSendAudio={model.sendAudio}
        onSendChat={model.sendChat}
        onChangeView={model.setViewMode}
        viewMode={model.viewMode}
      />
    </div>
  );
}

function StatusScreen({ text }: { text: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
      <div className="text-muted-foreground text-sm">{text}</div>
    </div>
  );
}
