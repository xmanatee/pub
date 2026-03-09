import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useCanvasCommands } from "~/features/live/hooks/use-canvas-commands";
import { useLivePreferences } from "~/features/live/hooks/use-live-preferences";
import type { ChannelMessage } from "~/features/live/lib/webrtc-browser";
import { useLiveSessionModel } from "~/features/live/hooks/use-live-session-model";
import { useLiveTransport } from "~/features/live/hooks/use-live-transport";
import { useLiveVisualState } from "~/features/live/model/live-visual-state";
import { useChatPreview } from "~/features/live-chat/hooks/use-chat-preview";
import { useLiveChatDelivery } from "~/features/live-chat/hooks/use-live-chat-delivery";
import { useLiveFiles } from "~/features/live-chat/hooks/use-live-files";
import { useControlBarAudio } from "~/features/live-control-bar/hooks/use-control-bar-audio";
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
}

export type LiveUiState =
  | "offline"
  | "connecting"
  | "needs-takeover"
  | "taken-over"
  | "recording"
  | "recording-paused"
  | "voice-mode"
  | "idle";

export function usePubLiveModel({ slug, pub, baseContentHtml }: UsePubLiveModelOptions) {
  const navigate = useNavigate();
  const recordPublicView = useMutation(api.analytics.recordPublicView);

  const {
    agentOnline,
    availableAgents,
    clearSessionError,
    closeLive,
    connectionAttempt,
    live,
    markBridgeConnected,
    resetSession,
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

  const [controlBarCollapsed, setControlBarCollapsed] = useState(false);
  const trackedAnalytics = useRef(false);
  const trackedViewCount = useRef(false);
  const notifiedStatusRef = useRef<string | null>(null);
  const lastSessionErrorRef = useRef<string | null>(null);
  const lastSlugRef = useRef<string | null>(null);
  const commandMessageHandlerRef = useRef<((cm: ChannelMessage) => void) | undefined>(undefined);

  const enabled =
    agentOnline === true && (sessionState === "inactive" || sessionState === "active");

  const {
    bridgeRef,
    bridgeState,
    lastAgentActivityAt,
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
    agentAnswer: sessionState === "active" ? live?.agentAnswer : undefined,
    agentCandidates: sessionState === "active" ? live?.agentCandidates : undefined,
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
    onCommandMessage: commandMessageHandlerRef.current,
  });

  const isOwner = pub?.isOwner === true;
  const liveMode = isOwner;

  const canvasCommands = useCanvasCommands({
    html: baseContentHtml ?? null,
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

  const hasCanvasContent = Boolean(baseContentHtml);

  useEffect(() => {
    if (pub === undefined) return;
    const statusKey =
      pub === null ? "not-found" : !hasCanvasContent && !liveMode ? "no-content" : null;
    if (!statusKey || notifiedStatusRef.current === statusKey) return;
    notifiedStatusRef.current = statusKey;
    const content =
      statusKey === "not-found"
        ? "This pub doesn't exist or is not accessible."
        : "This pub has no static content yet.";
    addSystemMessage({
      content,
      dedupeKey: `pub-status:${statusKey}`,
      severity: statusKey === "not-found" ? "error" : "warning",
    });
  }, [pub, hasCanvasContent, liveMode, addSystemMessage]);

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
    clearMessages();
    clearFiles();
    resetSession();
    closeLive();
  }, [slug, dismissPreview, clearMessages, clearFiles, resetSession, closeLive]);

  useEffect(() => {
    if (bridgeState === "connected") markBridgeConnected();
  }, [bridgeState, markBridgeConnected]);

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
    setViewMode("canvas");
  }, [dismissPreview, clearFiles, clearMessages, clearSessionError, setViewMode]);

  const visualState = useLiveVisualState({
    bridgeState,
    hasCanvasContent,
    lastAgentActivityAt,
    lastUserDeliveredAt,
  });

  let uiState: LiveUiState = "idle";
  if (agentOnline === false) uiState = "offline";
  else if (sessionState === "needs-takeover") uiState = "needs-takeover";
  else if (sessionState === "taken-over") uiState = "taken-over";
  else if (audio.mode === "recording") uiState = "recording";
  else if (audio.mode === "recording-paused") uiState = "recording-paused";
  else if (audio.mode === "voice-mode") uiState = "voice-mode";
  else if (liveMode && bridgeState !== "connected") uiState = "connecting";

  const handleClose = useCallback(() => {
    setControlBarCollapsed(false);
    resetLiveSurface();
    closeLive();
    void navigate({ to: "/dashboard" });
  }, [resetLiveSurface, closeLive, navigate]);

  return {
    agentName: live?.agentName ?? null,
    agentOnline,
    audio,
    availableAgents,
    addSystemMessage,
    autoOpenCanvas,
    bridgeRef,
    bridgeState,
    clearFiles,
    clearMessages,
    canUseDeveloperMode,
    closeLive: handleClose,
    connected: bridgeState === "connected",
    controlBarCollapsed,
    developerModeEnabled,
    dismissPreview,
    files,
    clearSessionError,
    hasCanvasContent,
    lastTakeoverAt: live?.lastTakeoverAt,
    live,
    messages,
    messagesEndRef,
    micGranted,
    preview,
    sendAudio,
    sendChat,
    sendFile,
    sendRenderError,
    sessionState,
    sessionError,
    selectedPresenceId,
    setSelectedPresenceId,
    setAutoOpenCanvas,
    setControlBarCollapsed,
    setDeveloperModeEnabled,
    setMicGranted,
    setViewMode,
    setVoiceModeEnabled,
    takeoverLive,
    onCanvasBridgeMessage: canvasCommands.onCanvasBridgeMessage,
    outboundCanvasBridgeMessage: canvasCommands.outboundCanvasBridgeMessage,
    uiState,
    viewMode,
    visualState,
    voiceModeEnabled,
  };
}
