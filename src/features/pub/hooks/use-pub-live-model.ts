import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useCanvasCommands } from "~/features/live/hooks/use-canvas-commands";
import { useLivePreferences } from "~/features/live/hooks/use-live-preferences";
import { useLiveSessionModel } from "~/features/live/hooks/use-live-session-model";
import { useLiveTransport } from "~/features/live/hooks/use-live-transport";
import type { ChannelMessage } from "~/features/live/lib/webrtc-browser";
import type { LiveContentState } from "~/features/live/types/live-types";
import { useChatPreview } from "~/features/live-chat/hooks/use-chat-preview";
import { useLiveChatDelivery } from "~/features/live-chat/hooks/use-live-chat-delivery";
import { useLiveFiles } from "~/features/live-chat/hooks/use-live-files";
import { useControlBarAudio } from "~/features/live-control-bar/hooks/use-control-bar-audio";
import { derivePubViewState } from "~/features/pub/model/pub-view-state";
import { useDeveloperMode } from "~/hooks/use-developer-mode";
import { trackPubViewed } from "~/lib/analytics";
import { api } from "../../../../convex/_generated/api";

type PubSnapshot =
  | {
      contentType?: string | null;
      isOwner?: boolean;
      isPublic: boolean;
      slug: string;
    }
  | null
  | undefined;

export interface UsePubLiveModelOptions {
  slug: string;
  pub?: PubSnapshot;
  baseContentHtml?: string | null;
  contentState: LiveContentState;
}

export function usePubLiveModel({
  slug,
  pub,
  baseContentHtml,
  contentState,
}: UsePubLiveModelOptions) {
  const navigate = useNavigate();
  const recordPublicView = useMutation(api.analytics.recordPublicView);
  const isOwner = pub?.isOwner === true;
  const liveMode = isOwner;

  const {
    agentOnline,
    availableAgents,
    clearSessionError,
    closeLive,
    connectionAttempt,
    live,
    markBridgeConnected,
    resetSession,
    retryConnection,
    sessionState,
    sessionError,
    selectedPresenceId,
    setSelectedPresenceId,
    storeBrowserCandidates,
    storeBrowserOffer,
    takeoverLive,
  } = useLiveSessionModel(slug);

  const {
    autoOpenCanvas,
    micGranted,
    setAutoOpenCanvas,
    setMicGranted,
    setVoiceModeEnabled,
    voiceModeEnabled,
  } = useLivePreferences();

  const { canUseDeveloperMode, developerModeEnabled, setDeveloperModeEnabled } = useDeveloperMode();

  const {
    addAgentAudioMessage,
    addAgentImageMessage,
    addAgentMessage,
    addSystemMessage,
    addUserPendingAttachmentMessage,
    addUserPendingAudioMessage,
    addUserPendingImageMessage,
    addUserPendingMessage,
    clearMessages,
    failSentMessages,
    markMessageConfirmed,
    markMessageFailed,
    markMessageFailedIfPending,
    markMessageReceived,
    markMessageSentIfPending,
    messages,
    messagesEndRef,
    updateAudioMessageAnalysis,
  } = useLiveChatDelivery();

  const { addReceivedBinaryFile, clearFiles, files } = useLiveFiles();

  const [canvasError, setCanvasError] = useState<string | null>(null);
  const [controlBarCollapsed, setControlBarCollapsed] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const trackedAnalytics = useRef(false);
  const trackedViewCount = useRef(false);
  const notifiedStatusRef = useRef<string | null>(null);
  const lastSessionErrorRef = useRef<string | null>(null);
  const lastSlugRef = useRef<string | null>(null);
  const commandMessageHandlerRef = useRef<((cm: ChannelMessage) => void) | undefined>(undefined);

  const enabled =
    liveMode && agentOnline === true && (sessionState === "inactive" || sessionState === "active");

  const {
    bridgeRef,
    bridgeState,
    lastAgentOutput,
    lastUserDeliveredAt,
    sendAudio,
    sendChat,
    sendFile,
    sendRenderError,
    setViewMode,
    viewMode,
  } = useLiveTransport({
    slug,
    enabled,
    connectionAttempt,
    agentAnswer: liveMode && sessionState === "active" ? live?.agentAnswer : undefined,
    agentCandidates: liveMode && sessionState === "active" ? live?.agentCandidates : undefined,
    storeBrowserOffer,
    storeBrowserCandidates,
    addAgentAudioMessage,
    addAgentImageMessage,
    addAgentMessage,
    addReceivedBinaryFile,
    addUserPendingAttachmentMessage,
    addUserPendingAudioMessage,
    addUserPendingImageMessage,
    addUserPendingMessage,
    addSystemMessage,
    failSentMessages,
    markMessageConfirmed,
    markMessageFailed,
    markMessageFailedIfPending,
    markMessageReceived,
    markMessageSentIfPending,
    updateAudioMessageAnalysis,
    onCommandMessageRef: commandMessageHandlerRef,
  });

  const canvasCommands = useCanvasCommands({
    bridgeRef,
    bridgeState,
    liveMode,
  });
  commandMessageHandlerRef.current = canvasCommands.handleBridgeCommandMessage;

  const audio = useControlBarAudio({
    disabled: bridgeState !== "connected",
    bridge: bridgeRef.current,
    micGranted,
    onMicGranted: setMicGranted,
    onSendAudio: sendAudio,
    onSystemMessage: addSystemMessage,
  });

  const { preview, dismissPreview } = useChatPreview(messages, viewMode);

  useEffect(() => {
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(interval);
  }, []);

  const hasCanvasContent = contentState === "ready" && Boolean(baseContentHtml);
  const viewState = derivePubViewState({
    agentOnline,
    audioMode: audio.machineMode,
    bridgeState,
    canvasError,
    command: canvasCommands.command,
    contentState,
    lastAgentOutput,
    lastUserDeliveredAt,
    liveMode,
    now,
    sessionError,
    sessionState,
  });

  useEffect(() => {
    if (pub === undefined) return;
    const statusKey =
      pub === null ? "not-found" : !liveMode && contentState === "empty" ? "no-content" : null;
    if (!statusKey || notifiedStatusRef.current === statusKey) return;
    notifiedStatusRef.current = statusKey;
    addSystemMessage({
      content:
        statusKey === "not-found"
          ? "This pub doesn't exist or is not accessible."
          : "This pub has no static content yet.",
      dedupeKey: `pub-status:${statusKey}`,
      severity: statusKey === "not-found" ? "error" : "warning",
    });
  }, [addSystemMessage, contentState, liveMode, pub]);

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
    setCanvasError(null);
    setControlBarCollapsed(false);
    trackedAnalytics.current = false;
    trackedViewCount.current = false;
    dismissPreview();
    clearMessages();
    clearFiles();
    resetSession();
    if (liveMode) closeLive();
  }, [slug, clearFiles, clearMessages, closeLive, dismissPreview, liveMode, resetSession]);

  useEffect(() => {
    if (bridgeState === "connected") markBridgeConnected();
  }, [bridgeState, markBridgeConnected]);

  useEffect(() => {
    if (!liveMode || !autoOpenCanvas) return;
    if (contentState !== "ready" || !baseContentHtml) return;
    setViewMode("canvas");
  }, [autoOpenCanvas, baseContentHtml, contentState, liveMode, setViewMode]);

  useEffect(() => {
    const nextError = sessionError;
    if (!nextError || nextError === lastSessionErrorRef.current) return;
    lastSessionErrorRef.current = nextError;
    addSystemMessage({
      content: nextError,
      dedupeKey: `session-error:${nextError}`,
      severity: "error",
    });
  }, [addSystemMessage, sessionError]);

  const resetLiveSurface = useCallback(() => {
    dismissPreview();
    clearFiles();
    clearMessages();
    clearSessionError();
    setCanvasError(null);
    setViewMode("canvas");
  }, [clearFiles, clearMessages, clearSessionError, dismissPreview, setViewMode]);

  const handleClose = useCallback(() => {
    setControlBarCollapsed(false);
    resetLiveSurface();
    if (liveMode) closeLive();
    void navigate({ to: "/dashboard" });
  }, [closeLive, liveMode, navigate, resetLiveSurface]);

  return {
    agentName: live?.agentName ?? null,
    agentOnline,
    audio,
    availableAgents,
    addSystemMessage,
    autoOpenCanvas,
    bridgeRef,
    bridgeState,
    canvasError,
    canUseDeveloperMode,
    clearFiles,
    clearMessages,
    clearSessionError,
    closeLive: handleClose,
    command: canvasCommands.command,
    connected: viewState.transportStatus === "connected",
    contentState,
    controlBarCollapsed,
    controlBarState: viewState.controlBarState,
    developerModeEnabled,
    dismissPreview,
    error: viewState.error,
    files,
    hasCanvasContent,
    lastTakeoverAt: live?.lastTakeoverAt,
    live,
    messages,
    messagesEndRef,
    micGranted,
    onCanvasBridgeMessage: canvasCommands.onCanvasBridgeMessage,
    outboundCanvasBridgeMessage: canvasCommands.outboundCanvasBridgeMessage,
    preview,
    retryConnection,
    sendAudio,
    sendChat,
    sendFile,
    sendRenderError,
    sessionState,
    selectedPresenceId,
    setAutoOpenCanvas,
    setCanvasError,
    setControlBarCollapsed,
    setDeveloperModeEnabled,
    setMicGranted,
    setSelectedPresenceId,
    setViewMode,
    setVoiceModeEnabled,
    takeoverLive,
    transportStatus: viewState.transportStatus,
    viewMode,
    visualState: viewState.visualState,
    voiceModeEnabled,
  };
}
