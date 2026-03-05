import { useEffect, useMemo, useRef, useState } from "react";
import { readStoredAnimationStyle } from "~/features/live/hooks/use-live-preferences";
import { useChatPreview } from "~/features/live-chat/hooks/use-chat-preview";
import { trackPubViewed } from "~/lib/analytics";
import type { usePubLiveModel } from "./use-pub-live-model";

type PubSnapshot =
  | {
      contentType?: string | null;
      isOwner?: boolean;
      isPublic: boolean;
      slug: string;
    }
  | null
  | undefined;

interface UsePubRouteControllerOptions {
  baseContentHtml: string | null;
  model: ReturnType<typeof usePubLiveModel>;
  pub: PubSnapshot;
  recordPublicView: (input: { slug: string }) => Promise<unknown>;
  slug: string;
}

export function usePubRouteController({
  baseContentHtml,
  model,
  pub,
  recordPublicView,
  slug,
}: UsePubRouteControllerOptions) {
  const trackedAnalytics = useRef(false);
  const trackedViewCount = useRef(false);
  const lastSessionErrorRef = useRef<string | null>(null);
  const [liveMode, setLiveMode] = useState(false);
  const [controlBarCollapsed, setControlBarCollapsed] = useState(false);

  const viewMode = liveMode ? model.viewMode : "canvas";
  const effectiveCanvasHtml = liveMode ? (model.canvasHtml ?? baseContentHtml) : baseContentHtml;
  const { preview, dismissPreview } = useChatPreview(model.messages, viewMode);

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
    lastSessionErrorRef.current = null;
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

  useEffect(() => {
    if (!liveMode) return;
    const nextError = model.sessionError;
    if (!nextError || nextError === lastSessionErrorRef.current) return;
    lastSessionErrorRef.current = nextError;
    model.addSystemMessage({
      content: nextError,
      dedupeKey: `session-error:${nextError}`,
      severity: "error",
    });
  }, [liveMode, model.addSystemMessage, model.sessionError]);

  const resetLiveSurface = () => {
    dismissPreview();
    model.clearCanvas();
    model.clearFiles();
    model.clearMessages();
    model.clearSessionError();
    model.setViewMode("canvas");
  };

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
    chatPreview: preview?.text ?? null,
    chatPreviewSeverity: preview?.severity ?? null,
    chatPreviewSource: preview?.source ?? null,
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
      resetLiveSurface();
      model.stopLive();
    },
    onDismissPreview: dismissPreview,
    onMicGranted: model.setMicGranted,
    onSystemMessage: model.addSystemMessage,
    onSendAudio: model.sendAudio,
    onSendChat: model.sendChat,
    onSendFile: model.sendFile,
    onTakeover: () => {
      void model
        .takeoverLive()
        .then(() => {
          model.startLive();
        })
        .catch((error: unknown) => {
          const content =
            error instanceof Error && error.message.trim().length > 0
              ? error.message
              : "Failed to take over live session";
          model.addSystemMessage({
            content,
            dedupeKey: `session-error:${content}`,
            severity: "error",
          });
        });
    },
    onToggleCollapsed: () => setControlBarCollapsed((collapsed) => !collapsed),
  };

  const staticAnimationStyle = useMemo(() => readStoredAnimationStyle(), []);
  const canvasAnimationStyle = liveMode ? model.animationStyle : staticAnimationStyle;
  const canvasVisualState = liveMode
    ? model.visualState
    : hasCanvasContent
      ? "idle"
      : "waiting-content";

  return {
    canShowNoContent,
    agentOnline: model.agentOnline,
    canvasAnimationStyle,
    canvasVisualState,
    chatPanelModel: {
      files: model.files,
      messages: model.messages,
      messagesEndRef: model.messagesEndRef,
    },
    controlBarActions,
    controlBarCollapsed,
    controlBarModel,
    controlBarTransport,
    effectiveCanvasHtml,
    hasCanvasContent,
    isLoading,
    isNotFound,
    isOwner,
    liveMode,
    onGoLive: () => {
      setLiveMode(true);
      setControlBarCollapsed(false);
      resetLiveSurface();
      model.startLive();
    },
    settingsPanelActions,
    settingsPanelModel,
    viewMode,
  };
}
