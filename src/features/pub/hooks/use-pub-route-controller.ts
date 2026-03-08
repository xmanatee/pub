import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
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
  const navigate = useNavigate();
  const trackedAnalytics = useRef(false);
  const trackedViewCount = useRef(false);
  const notifiedStatusRef = useRef<string | null>(null);
  const lastSessionErrorRef = useRef<string | null>(null);
  const lastSlugRef = useRef<string | null>(null);
  const [controlBarCollapsed, setControlBarCollapsed] = useState(false);

  const isOwner = pub?.isOwner === true;
  const liveMode = isOwner;

  const viewMode = liveMode ? model.viewMode : "canvas";
  const effectiveCanvasHtml = liveMode ? (model.canvasHtml ?? baseContentHtml) : baseContentHtml;
  const { preview, dismissPreview } = useChatPreview(model.messages, viewMode);

  const isLoading = pub === undefined;
  const isNotFound = pub === null;
  const hasCanvasContent = Boolean(effectiveCanvasHtml);

  useEffect(() => {
    if (isLoading) return;
    const statusKey = isNotFound
      ? "not-found"
      : !hasCanvasContent && !liveMode
        ? "no-content"
        : null;
    if (!statusKey || notifiedStatusRef.current === statusKey) return;
    notifiedStatusRef.current = statusKey;
    const content =
      statusKey === "not-found"
        ? "This pub doesn't exist or is not accessible."
        : "This pub has no static content yet.";
    model.addSystemMessage({
      content,
      dedupeKey: `pub-status:${statusKey}`,
      severity: statusKey === "not-found" ? "error" : "warning",
    });
  }, [isLoading, isNotFound, hasCanvasContent, liveMode, model.addSystemMessage]);

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

  useEffect(() => {
    if (lastSlugRef.current === slug) return;
    lastSlugRef.current = slug;

    lastSessionErrorRef.current = null;
    notifiedStatusRef.current = null;
    setControlBarCollapsed(false);
    trackedAnalytics.current = false;
    trackedViewCount.current = false;
    dismissPreview();
    model.resetForSlugChange();
    model.closeLive();
  }, [dismissPreview, model.resetForSlugChange, model.closeLive, slug]);

  useEffect(() => {
    const nextError = model.sessionError;
    if (!nextError || nextError === lastSessionErrorRef.current) return;
    lastSessionErrorRef.current = nextError;
    model.addSystemMessage({
      content: nextError,
      dedupeKey: `session-error:${nextError}`,
      severity: "error",
    });
  }, [model.addSystemMessage, model.sessionError]);

  const resetLiveSurface = useCallback(() => {
    dismissPreview();
    model.clearCanvas();
    model.clearFiles();
    model.clearMessages();
    model.clearSessionError();
    model.setViewMode("canvas");
  }, [
    dismissPreview,
    model.clearCanvas,
    model.clearFiles,
    model.clearMessages,
    model.clearSessionError,
    model.setViewMode,
  ]);

  const settingsPanelModel = {
    behavior: {
      autoOpenCanvas: model.autoOpenCanvas,
      canUseDeveloperMode: model.canUseDeveloperMode,
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
    onClearCanvas: model.clearCanvas,
    onClearFiles: model.clearFiles,
    onClearMessages: model.clearMessages,
    onDeveloperModeChange: model.setDeveloperModeEnabled,
    onVoiceModeEnabledChange: model.setVoiceModeEnabled,
  };

  const controlBarModel = {
    agentName: model.agentName,
    agentOnline: model.agentOnline,
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
      setControlBarCollapsed(false);
      resetLiveSurface();
      model.closeLive();
      void navigate({ to: "/dashboard" });
    },
    onDismissPreview: dismissPreview,
    onMicGranted: model.setMicGranted,
    onSystemMessage: model.addSystemMessage,
    onSendAudio: model.sendAudio,
    onSendChat: model.sendChat,
    onSendFile: model.sendFile,
    onTakeover: () => {
      void model.takeoverLive().catch((error: unknown) => {
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

  const canvasVisualState = liveMode
    ? model.visualState
    : hasCanvasContent
      ? "idle"
      : "waiting-content";

  return {
    availableAgents: model.availableAgents,
    agentOnline: model.agentOnline,
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
    isOwner,
    liveMode,
    onCanvasBridgeMessage: isOwner ? model.onCanvasBridgeMessage : undefined,
    onSelectedPresenceChange: model.setSelectedPresenceId,
    onRenderError: isOwner ? model.sendRenderError : undefined,
    outboundCanvasBridgeMessage: isOwner ? model.outboundCanvasBridgeMessage : null,
    settingsPanelActions,
    settingsPanelModel,
    selectedPresenceId: model.selectedPresenceId,
    viewMode,
  };
}
