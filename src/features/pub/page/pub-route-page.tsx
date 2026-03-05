import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CanvasPanel } from "~/features/live/components/panels/canvas-panel";
import { SettingsPanel } from "~/features/live/components/panels/settings-panel";
import { useContentHtml } from "~/features/live/hooks/use-content-html";
import { useLivePageModel } from "~/features/live/hooks/use-live-page-model";
import { readStoredAnimationStyle } from "~/features/live/hooks/use-live-preferences";
import { ChatPanel } from "~/features/live-chat/components/chat-panel";
import { useChatPreview } from "~/features/live-chat/hooks/use-chat-preview";
import { ControlBar } from "~/features/live-control-bar/components/control-bar";
import { ControlBarGoLiveMode } from "~/features/live-control-bar/components/control-bar-go-live-mode";
import { trackPubViewed } from "~/lib/analytics";
import { api } from "../../../../convex/_generated/api";

export function PubRoutePage({ slug }: { slug: string }) {
  const pub = useQuery(api.pubs.getBySlug, { slug });
  const model = useLivePageModel(slug);
  const recordPublicView = useMutation(api.analytics.recordPublicView);
  const trackedAnalytics = useRef(false);
  const trackedViewCount = useRef(false);
  const [liveMode, setLiveMode] = useState(false);
  const [controlBarCollapsed, setControlBarCollapsed] = useState(false);
  const baseContentHtml = useContentHtml(pub?.content, pub?.contentType);
  const viewMode = liveMode ? model.viewMode : "canvas";
  const effectiveCanvasHtml = liveMode ? (model.canvasHtml ?? baseContentHtml) : baseContentHtml;
  const { previewText, dismissPreview } = useChatPreview(model.messages, viewMode);
  const isOwner = pub?.isOwner === true;
  const isLoading = pub === undefined;
  const isNotFound = pub === null;
  const hasCanvasContent = Boolean(effectiveCanvasHtml);
  const canShowNoContent = !isLoading && !isNotFound && !liveMode && !hasCanvasContent;

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
    setControlBarCollapsed(false);
    trackedAnalytics.current = false;
    trackedViewCount.current = false;
    dismissPreview();
    model.stopLive();
    model.clearCanvas();
    model.clearFiles();
    model.clearMessages();
    model.clearSessionError();
    model.setViewMode("canvas");
  }, [slug]);

  const settingsPanelModel = {
    behavior: {
      autoOpenCanvas: model.autoOpenCanvas,
      animationStyle: model.animationStyle,
      developerModeEnabled: model.developerModeEnabled,
      voiceModeEnabled: model.voiceModeEnabled,
    },
    stats: {
      fileCount: model.files.length,
      hasCanvasContent,
      messageCount: model.messages.length,
    },
  };

  const settingsPanelActions = {
    onAutoOpenCanvasChange: model.setAutoOpenCanvas,
    onAnimationStyleChange: model.setAnimationStyle,
    onClearCanvas: model.clearCanvas,
    onClearFiles: model.clearFiles,
    onClearMessages: model.clearMessages,
    onDeveloperModeChange: model.setDeveloperModeEnabled,
    onVoiceModeEnabledChange: model.setVoiceModeEnabled,
  };

  const controlBarModel = {
    agentName: model.agentName,
    chatPreview: previewText,
    collapsed: controlBarCollapsed,
    lastTakeoverAt: model.lastTakeoverAt,
    sendDisabled: !model.connected,
    sessionState: model.sessionState,
    viewMode: model.viewMode,
    visualState: model.visualState,
    voiceModeEnabled: model.voiceModeEnabled,
  };

  const controlBarTransport = {
    bridge: model.bridgeRef.current,
    micGranted: model.micGranted,
  };

  const controlBarActions = {
    onChangeView: model.setViewMode,
    onClose: () => {
      setLiveMode(false);
      setControlBarCollapsed(false);
      dismissPreview();
      model.stopLive();
      model.clearCanvas();
      model.clearFiles();
      model.clearMessages();
      model.clearSessionError();
      model.setViewMode("canvas");
    },
    onDismissPreview: dismissPreview,
    onMicGranted: model.setMicGranted,
    onSendAudio: model.sendAudio,
    onSendChat: model.sendChat,
    onSendFile: model.sendFile,
    onTakeover: () => {
      void model.takeoverLive().then(
        () => {
          model.startLive();
        },
        () => {
          // session errors are surfaced via model.sessionError
        },
      );
    },
    onToggleCollapsed: () => setControlBarCollapsed((c) => !c),
  };

  const staticAnimationStyle = useMemo(() => readStoredAnimationStyle(), []);
  const canvasAnimationStyle = liveMode ? model.animationStyle : staticAnimationStyle;
  const canvasVisualState = liveMode
    ? model.visualState
    : hasCanvasContent
      ? "idle"
      : "waiting-content";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background text-foreground">
      {liveMode && controlBarCollapsed ? null : (
        <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-background/60 to-transparent pointer-events-none" />
      )}

      <div className="flex-1 min-h-0 relative">
        {isLoading ? <StatusScreen text="Loading..." /> : null}
        {isNotFound ? <NotFoundScreen /> : null}
        {canShowNoContent ? <NoContentScreen /> : null}

        {!isLoading && !isNotFound && !canShowNoContent && viewMode === "canvas" ? (
          <CanvasPanel
            animationStyle={canvasAnimationStyle}
            html={effectiveCanvasHtml}
            visualState={canvasVisualState}
          />
        ) : null}

        {liveMode && viewMode === "chat" ? (
          <ChatPanel
            files={model.files}
            messages={model.messages}
            messagesEndRef={model.messagesEndRef}
          />
        ) : null}

        {liveMode && viewMode === "settings" ? (
          <SettingsPanel model={settingsPanelModel} actions={settingsPanelActions} />
        ) : null}

        {liveMode && model.sessionError ? (
          <div className="pointer-events-none absolute left-1/2 top-4 z-20 -translate-x-1/2">
            <p className="rounded-full border border-destructive/40 bg-background/90 px-3 py-1 text-xs text-destructive shadow-sm backdrop-blur">
              {model.sessionError}
            </p>
          </div>
        ) : null}
      </div>

      {isOwner && !liveMode ? (
        <ControlBarGoLiveMode
          slug={slug}
          onGoLive={() => {
            setLiveMode(true);
            setControlBarCollapsed(false);
            dismissPreview();
            model.clearCanvas();
            model.clearFiles();
            model.clearMessages();
            model.clearSessionError();
            model.setViewMode("canvas");
            model.startLive();
          }}
        />
      ) : null}

      {isOwner && liveMode ? (
        <ControlBar
          model={controlBarModel}
          transport={controlBarTransport}
          actions={controlBarActions}
        />
      ) : null}
    </div>
  );
}

function StatusScreen({ text }: { text: string }) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-background">
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

function NotFoundScreen() {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <h1 className="text-xl font-semibold">Not found</h1>
      <p className="text-sm text-muted-foreground">
        This pub doesn&apos;t exist or is not accessible.
      </p>
      <Link to="/" className="text-sm text-primary hover:underline">
        Go to pub.blue
      </Link>
    </div>
  );
}

function NoContentScreen() {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <h1 className="text-xl font-semibold">No content</h1>
      <p className="text-sm text-muted-foreground">This pub has no static content yet.</p>
    </div>
  );
}
