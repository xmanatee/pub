import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { ControlBar } from "~/features/live/components/control-bar/control-bar";
import { ControlBarGoLiveMode } from "~/features/live/components/control-bar/control-bar-go-live-mode";
import { CanvasPanel } from "~/features/live/components/panels/canvas-panel";
import { ChatPanel } from "~/features/live/components/panels/chat-panel";
import { SettingsPanel } from "~/features/live/components/panels/settings-panel";
import { useChatPreview } from "~/features/live/hooks/use-chat-preview";
import { useContentHtml } from "~/features/live/hooks/use-content-html";
import { useLivePageModel } from "~/features/live/hooks/use-live-page-model";
import { readStoredAnimationStyle } from "~/features/live/hooks/use-live-preferences";
import { trackPubViewed } from "~/lib/analytics";
import { api } from "../../convex/_generated/api";

export const Route = createFileRoute("/p/$slug")({
  component: PubPage,
});

function PubPage() {
  const { slug } = Route.useParams();
  const pub = useQuery(api.pubs.getBySlug, { slug });
  const recordPublicView = useMutation(api.analytics.recordPublicView);
  const trackedAnalytics = useRef(false);
  const trackedViewCount = useRef(false);
  const [liveMode, setLiveMode] = useState(false);
  const contentHtml = useContentHtml(pub?.content, pub?.contentType);

  useEffect(() => {
    if (pub && !trackedAnalytics.current) {
      trackedAnalytics.current = true;
      trackPubViewed({
        slug: pub.slug,
        contentType: pub.contentType ?? "text",
        isPublic: pub.isPublic,
      });
    }
  }, [pub]);

  useEffect(() => {
    if (!pub || !pub.isPublic || trackedViewCount.current) return;
    trackedViewCount.current = true;
    void recordPublicView({ slug: pub.slug });
  }, [pub, recordPublicView]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset state on slug navigation
  useEffect(() => {
    setLiveMode(false);
    trackedAnalytics.current = false;
    trackedViewCount.current = false;
  }, [slug]);

  if (pub?.isOwner && liveMode) {
    return <LiveView slug={slug} />;
  }

  const animationStyle = readStoredAnimationStyle();
  const visualState = pub === null ? "disconnected" : contentHtml ? "idle" : "waiting-content";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background text-foreground">
      <div className="flex-1 min-h-0 relative">
        <CanvasPanel animationStyle={animationStyle} html={contentHtml} visualState={visualState} />
      </div>
      {pub?.isOwner ? (
        <ControlBarGoLiveMode slug={slug} onGoLive={() => setLiveMode(true)} />
      ) : null}
    </div>
  );
}

function LiveView({ slug }: { slug: string }) {
  const navigate = useNavigate();
  const model = useLivePageModel(slug);
  const { previewText, dismissPreview } = useChatPreview(model.messages, model.viewMode);
  const [controlBarCollapsed, setControlBarCollapsed] = useState(false);

  useEffect(() => {
    if (model.agentOnline && !model.liveRequested) {
      model.goLive();
    }
  }, [model.agentOnline, model.liveRequested, model.goLive]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background text-foreground">
      {controlBarCollapsed ? null : (
        <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-background/60 to-transparent pointer-events-none" />
      )}

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
            developerModeEnabled={model.developerModeEnabled}
            fileCount={model.files.length}
            hasCanvasContent={Boolean(model.canvasHtml)}
            messageCount={model.messages.length}
            onAutoOpenCanvasChange={model.setAutoOpenCanvas}
            onAnimationStyleChange={model.setAnimationStyle}
            onClearCanvas={model.clearCanvas}
            onClearFiles={model.clearFiles}
            onClearMessages={model.clearMessages}
            onDeveloperModeChange={model.setDeveloperModeEnabled}
            onShowDeliveryStatusChange={model.setShowDeliveryStatus}
            onVoiceModeEnabledChange={model.setVoiceModeEnabled}
            showDeliveryStatus={model.showDeliveryStatus}
            voiceModeEnabled={model.voiceModeEnabled}
          />
        ) : null}
      </div>

      <ControlBar
        agentName={model.agentName}
        chatPreview={previewText}
        collapsed={controlBarCollapsed}
        sendDisabled={!model.connected}
        bridge={model.bridgeRef.current}
        lastTakeoverAt={model.lastTakeoverAt}
        onClose={() => navigate({ to: "/dashboard" })}
        onDismissPreview={dismissPreview}
        onTakeover={() => void model.takeoverLive()}
        onToggleCollapsed={() => setControlBarCollapsed((c) => !c)}
        micGranted={model.micGranted}
        onMicGranted={model.setMicGranted}
        onSendAudio={model.sendAudio}
        onSendChat={model.sendChat}
        sessionState={model.sessionState}
        onChangeView={model.setViewMode}
        viewMode={model.viewMode}
        visualState={model.visualState}
        voiceModeEnabled={model.voiceModeEnabled}
      />
    </div>
  );
}
