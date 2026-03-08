import { useCallback, useEffect } from "react";
import { useLivePreferences } from "~/features/live/hooks/use-live-preferences";
import { useLiveSessionModel } from "~/features/live/hooks/use-live-session-model";
import { useLiveTransport } from "~/features/live/hooks/use-live-transport";
import { useLiveVisualState } from "~/features/live/model/live-visual-state";
import { useLiveChatDelivery } from "~/features/live-chat/hooks/use-live-chat-delivery";
import { useLiveFiles } from "~/features/live-chat/hooks/use-live-files";
import { useDeveloperMode } from "~/hooks/use-developer-mode";

export function usePubLiveModel(slug: string) {
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

  const enabled =
    agentOnline === true && (sessionState === "inactive" || sessionState === "active");

  const {
    bridgeRef,
    bridgeState,
    canvasHtml,
    clearCanvas,
    lastAgentActivityAt,
    lastUserDeliveredAt,
    onCanvasBridgeMessage,
    outboundCanvasBridgeMessage,
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
    autoOpenCanvas,
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
  });

  const resetForSlugChange = useCallback(() => {
    clearMessages();
    clearFiles();
    resetSession();
  }, [clearFiles, clearMessages, resetSession]);

  useEffect(() => {
    if (bridgeState === "connected") markBridgeConnected();
  }, [bridgeState, markBridgeConnected]);

  const visualState = useLiveVisualState({
    bridgeState,
    hasCanvasContent: Boolean(canvasHtml),
    lastAgentActivityAt,
    lastUserDeliveredAt,
  });

  return {
    agentName: live?.agentName ?? null,
    agentOnline,
    availableAgents,
    addSystemMessage,
    autoOpenCanvas,
    bridgeRef,
    bridgeState,
    canvasHtml,
    clearCanvas,
    clearFiles,
    clearMessages,
    canUseDeveloperMode,
    closeLive,
    connected: bridgeState === "connected",
    developerModeEnabled,
    files,
    clearSessionError,
    lastTakeoverAt: live?.lastTakeoverAt,
    live,
    messages,
    messagesEndRef,
    micGranted,
    onCanvasBridgeMessage,
    outboundCanvasBridgeMessage,
    resetForSlugChange,
    sendAudio,
    sendChat,
    sendFile,
    sendRenderError,
    sessionState,
    sessionError,
    selectedPresenceId,
    setSelectedPresenceId,
    setAutoOpenCanvas,
    setDeveloperModeEnabled,
    setMicGranted,
    setViewMode,
    setVoiceModeEnabled,
    takeoverLive,
    viewMode,
    visualState,
    voiceModeEnabled,
  };
}
