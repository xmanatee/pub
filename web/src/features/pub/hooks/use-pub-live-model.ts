import { api } from "@backend/_generated/api";
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

type PubSnapshot =
  | {
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
  const [canvasHtml, setCanvasHtml] = useState<string | null>(baseContentHtml ?? null);
  const [canvasScopeVersion, setCanvasScopeVersion] = useState(1);
  const [controlBarCollapsed, setControlBarCollapsed] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const trackedAnalytics = useRef(false);
  const trackedViewCount = useRef(false);
  const notifiedStatusRef = useRef<string | null>(null);
  const lastSessionErrorRef = useRef<string | null>(null);
  const lastSlugRef = useRef<string | null>(null);
  const lastCanvasScopeRef = useRef<{ html: string | null; slug: string }>({
    html: baseContentHtml ?? null,
    slug,
  });
  const lastLiveSessionIdRef = useRef<string | null>(null);
  const lastSelectedPresenceIdRef = useRef<typeof selectedPresenceId>(null);
  const lastCanvasHtmlRef = useRef<string | null>(baseContentHtml ?? null);
  const commandMessageHandlerRef = useRef<((cm: ChannelMessage) => void) | undefined>(undefined);

  const enabled =
    liveMode &&
    agentOnline === true &&
    selectedPresenceId !== null &&
    (sessionState === "inactive" || sessionState === "active");
  const transportKey = [slug, selectedPresenceId ?? "unselected", connectionAttempt].join(":");
  const canvasScopeKey = `${slug}:${canvasScopeVersion}`;

  const {
    bridgeRef,
    bridgeState,
    liveReady,
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
    transportKey,
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

  const {
    command,
    handleBridgeCommandMessage,
    onCanvasBridgeMessage,
    outboundCanvasBridgeMessage,
    reset: resetCanvasCommands,
  } = useCanvasCommands({
    bridgeRef,
    bridgeState,
    canvasScopeKey,
    liveReady,
    liveMode,
    sessionKey: transportKey,
  });
  commandMessageHandlerRef.current = handleBridgeCommandMessage;

  const audio = useControlBarAudio({
    disabled: !liveReady,
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

  useEffect(() => {
    setCanvasHtml(baseContentHtml ?? null);
  }, [baseContentHtml]);

  useEffect(() => {
    const previous = lastCanvasScopeRef.current;
    if (previous.slug === slug && previous.html === canvasHtml) return;
    const hadPriorCanvas = previous.html !== null;
    lastCanvasScopeRef.current = { slug, html: canvasHtml };
    if (hadPriorCanvas) {
      setCanvasScopeVersion((current) => current + 1);
    }
  }, [canvasHtml, slug]);

  const effectiveContentState = canvasHtml ? "ready" : contentState;
  const hasCanvasContent = Boolean(canvasHtml);
  const needsAgentSelection = availableAgents.length > 1 && selectedPresenceId === null;
  const viewState = derivePubViewState({
    agentOnline,
    audioMode: audio.machineMode,
    bridgeState,
    liveReady,
    canvasError,
    command,
    contentState: effectiveContentState,
    lastAgentOutput,
    lastUserDeliveredAt,
    liveMode,
    needsAgentSelection,
    now,
    sessionError,
    sessionState,
  });

  useEffect(() => {
    if (pub === undefined) return;
    const statusKey =
      pub === null
        ? "not-found"
        : !liveMode && effectiveContentState === "empty"
          ? "no-content"
          : null;
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
  }, [addSystemMessage, effectiveContentState, liveMode, pub]);

  useEffect(() => {
    if (pub && !trackedAnalytics.current) {
      trackedAnalytics.current = true;
      trackPubViewed({
        slug: pub.slug,
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
    if (lastSlugRef.current === null) {
      lastSlugRef.current = slug;
      return;
    }
    if (lastSlugRef.current === slug) return;
    lastSlugRef.current = slug;
    lastSessionErrorRef.current = null;
    notifiedStatusRef.current = null;
    lastLiveSessionIdRef.current = null;
    lastSelectedPresenceIdRef.current = null;
    setCanvasError(null);
    setCanvasHtml(baseContentHtml ?? null);
    setControlBarCollapsed(false);
    trackedAnalytics.current = false;
    trackedViewCount.current = false;
    dismissPreview();
    clearMessages();
    clearFiles();
    resetCanvasCommands();
    resetSession();
  }, [
    baseContentHtml,
    slug,
    dismissPreview,
    clearMessages,
    clearFiles,
    resetCanvasCommands,
    resetSession,
  ]);

  useEffect(() => {
    if (liveReady) markBridgeConnected();
  }, [liveReady, markBridgeConnected]);

  useEffect(() => {
    const previousCanvasHtml = lastCanvasHtmlRef.current;
    lastCanvasHtmlRef.current = canvasHtml;
    if (!liveMode || !autoOpenCanvas) return;
    if (!canvasHtml || canvasHtml === previousCanvasHtml) return;
    setViewMode("canvas");
  }, [autoOpenCanvas, canvasHtml, liveMode, setViewMode]);

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
    resetCanvasCommands();
    setCanvasError(null);
    setCanvasHtml(baseContentHtml ?? null);
    setViewMode("canvas");
  }, [
    baseContentHtml,
    clearFiles,
    clearMessages,
    clearSessionError,
    dismissPreview,
    resetCanvasCommands,
    setViewMode,
  ]);

  useEffect(() => {
    if (!liveMode) {
      lastLiveSessionIdRef.current = null;
      return;
    }

    const nextLiveSessionId = live?._id ?? null;
    const previousLiveSessionId = lastLiveSessionIdRef.current;

    if (nextLiveSessionId !== null) {
      lastLiveSessionIdRef.current = nextLiveSessionId;
    }

    if (
      previousLiveSessionId === null ||
      nextLiveSessionId === null ||
      previousLiveSessionId === nextLiveSessionId
    ) {
      return;
    }

    resetLiveSurface();
  }, [live?._id, liveMode, resetLiveSurface]);

  useEffect(() => {
    if (!liveMode) {
      lastSelectedPresenceIdRef.current = null;
      return;
    }

    const previousPresenceId = lastSelectedPresenceIdRef.current;
    lastSelectedPresenceIdRef.current = selectedPresenceId;

    if (previousPresenceId === null || previousPresenceId === selectedPresenceId) {
      return;
    }

    resetLiveSurface();
  }, [liveMode, resetLiveSurface, selectedPresenceId]);

  const handleClose = useCallback(() => {
    setControlBarCollapsed(false);
    resetLiveSurface();
    if (liveMode) closeLive();
    void navigate({ to: "/dashboard" });
  }, [closeLive, liveMode, navigate, resetLiveSurface]);

  const handleSelectedPresenceId = useCallback(
    (presenceId: typeof selectedPresenceId) => {
      if (presenceId === selectedPresenceId) return;
      setSelectedPresenceId(presenceId);
    },
    [selectedPresenceId, setSelectedPresenceId],
  );

  return {
    agentName: live?.agentName ?? null,
    agentOnline,
    audio,
    availableAgents,
    addSystemMessage,
    autoOpenCanvas,
    bridgeRef,
    bridgeState,
    liveReady,
    canvasError,
    canvasHtml,
    canUseDeveloperMode,
    clearFiles,
    clearMessages,
    clearSessionError,
    closeLive: handleClose,
    command,
    connected: viewState.transportStatus === "connected",
    contentState: effectiveContentState,
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
    onCanvasBridgeMessage,
    outboundCanvasBridgeMessage,
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
    setSelectedPresenceId: handleSelectedPresenceId,
    setViewMode,
    setVoiceModeEnabled,
    takeoverLive,
    transportStatus: viewState.transportStatus,
    viewMode,
    visualState: viewState.visualState,
    voiceModeEnabled,
  };
}
