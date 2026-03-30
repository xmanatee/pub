import { api } from "@backend/_generated/api";
import { extractManifestFromHtml } from "@shared/command-protocol-core";
import { canSendAgentTraffic } from "@shared/live-runtime-state-core";
import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCanvasCommands } from "~/features/live/hooks/use-canvas-commands";
import { useErrorThrottle } from "~/features/live/hooks/use-error-throttle";
import { useLivePreferences } from "~/features/live/hooks/use-live-preferences";
import { useLiveSessionModel } from "~/features/live/hooks/use-live-session-model";
import { useLiveTransport } from "~/features/live/hooks/use-live-transport";
import { usePubFsBridge } from "~/features/live/hooks/use-pub-fs-bridge";
import { profileMark, profilePrint, profileStart } from "~/features/live/lib/connection-profiler";
import type { ChannelMessage } from "~/features/live/lib/webrtc-browser";
import type { LiveContentState, LiveRenderErrorPayload } from "~/features/live/types/live-types";
import { useChatPreview } from "~/features/live-chat/hooks/use-chat-preview";
import { useLiveChatDelivery } from "~/features/live-chat/hooks/use-live-chat-delivery";
import { useLiveFiles } from "~/features/live-chat/hooks/use-live-files";
import { useControlBarAudio } from "~/features/live-control-bar/hooks/use-control-bar-audio";
import {
  deriveDefaultLiveRequested,
  deriveLiveStartPolicy,
} from "~/features/pub/model/live-start-policy";
import { derivePubViewState, isControlBarCollapsible } from "~/features/pub/model/pub-view-state";
import { useDeveloperMode } from "~/hooks/use-developer-mode";
import { trackPubViewed } from "~/lib/analytics";
import { getConvexSiteUrl } from "~/lib/convex-url";

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

function formatRenderErrorDetails(payload: LiveRenderErrorPayload): string | undefined {
  const parts: string[] = [];
  if (payload.filename) parts.push(`File: ${payload.filename}`);
  if (typeof payload.lineno === "number" && payload.lineno > 0) {
    const loc =
      typeof payload.colno === "number" && payload.colno > 0
        ? `${payload.lineno}:${payload.colno}`
        : String(payload.lineno);
    parts.push(`Location: line ${loc}`);
  }
  return parts.length > 0 ? parts.join("\n") : undefined;
}

export function usePubLiveModel({
  slug,
  pub,
  baseContentHtml,
  contentState,
}: UsePubLiveModelOptions) {
  const navigate = useNavigate();
  const recordPubView = useMutation(api.analytics.recordPubView);
  const createOwnerContentAccessToken = useMutation(
    api.pubAccessTokens.createOwnerContentAccessToken,
  );
  const isOwner = pub?.isOwner === true;
  const liveMode = isOwner;
  const contentAccessState =
    pub === undefined ? "loading" : pub === null ? "missing" : isOwner ? "owner" : "public";
  const publicContentBaseUrl = useMemo(
    () => `${getConvexSiteUrl()}/serve/${encodeURIComponent(slug)}/`,
    [slug],
  );
  const baseManifest = useMemo(
    () => (baseContentHtml ? extractManifestFromHtml(baseContentHtml) : null),
    [baseContentHtml],
  );
  const hasBaseCommandManifest = baseManifest !== null;
  const defaultLiveRequested = deriveDefaultLiveRequested({
    contentState,
    hasCommandManifest: hasBaseCommandManifest,
  });

  const {
    autoFullscreen,
    autoOpenCanvas,
    defaultAgentName,
    setAutoFullscreen,
    setAutoOpenCanvas,
    setDefaultAgentName,
    setVoiceModeEnabled,
    voiceModeEnabled,
  } = useLivePreferences();

  const {
    agentOnline,
    availableAgents,
    clearSessionError,
    closeLive,
    connectionAttempt,
    lastTakeoverAt,
    live,
    markBridgeConnected,
    resetSession,
    retryConnection,
    sessionState,
    sessionError,
    selectedHostId,
    setSelectedHostId,
    storeBrowserCandidates,
    storeBrowserOffer,
    takeoverLive,
  } = useLiveSessionModel(slug, defaultAgentName);

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

  const [canvasHtml, setCanvasHtml] = useState<string | null>(baseContentHtml ?? null);
  const [contentBaseUrl, setContentBaseUrl] = useState<string | null>(() =>
    isOwner ? null : publicContentBaseUrl,
  );
  const [canvasScopeVersion, setCanvasScopeVersion] = useState(1);
  const [collapsePreference, setCollapsePreference] = useState(
    () =>
      deriveLiveStartPolicy({
        availableAgentCount: availableAgents.length,
        hasCanvasContent: Boolean(baseContentHtml),
        hasCommandManifest: hasBaseCommandManifest,
        liveRequested: defaultLiveRequested,
        selectedHostId,
      }).defaultCollapsed,
  );
  const [liveRequestedOverride, setLiveRequestedOverride] = useState<boolean | null>(null);
  const liveRequested = liveRequestedOverride ?? defaultLiveRequested;
  const trackedAnalytics = useRef(false);
  const notifiedStatusRef = useRef<string | null>(null);
  const lastSessionErrorRef = useRef<string | null>(null);
  const lastSlugRef = useRef<string | null>(null);
  const lastCanvasScopeRef = useRef<{ html: string | null; slug: string }>({
    html: baseContentHtml ?? null,
    slug,
  });
  const lastLiveBrowserSessionIdRef = useRef<string | null>(null);
  const lastSelectedHostIdRef = useRef<typeof selectedHostId>(null);
  const lastCanvasHtmlRef = useRef<string | null>(baseContentHtml ?? null);
  const lastReportedCommandErrorRef = useRef<number | null>(null);
  const commandMessageHandlerRef = useRef<((cm: ChannelMessage) => void) | undefined>(undefined);
  const pubFsMessageHandlerRef = useRef<((cm: ChannelMessage) => void) | undefined>(undefined);

  const hasCommandManifest = useMemo(() => {
    const content = canvasHtml ?? baseContentHtml ?? null;
    return content ? extractManifestFromHtml(content) !== null : false;
  }, [baseContentHtml, canvasHtml]);
  const liveStartPolicy = useMemo(
    () =>
      deriveLiveStartPolicy({
        availableAgentCount: availableAgents.length,
        hasCanvasContent: Boolean(canvasHtml),
        hasCommandManifest,
        liveRequested,
        selectedHostId,
      }),
    [availableAgents.length, canvasHtml, hasCommandManifest, liveRequested, selectedHostId],
  );
  const liveEnabled = liveMode && (hasCommandManifest || liveRequested);

  const enabled =
    liveEnabled &&
    agentOnline === true &&
    selectedHostId !== null &&
    (sessionState === "inactive" || sessionState === "active");
  const transportKey = [slug, selectedHostId ?? "unselected", connectionAttempt].join(":");
  const canvasScopeKey = `${slug}:${canvasScopeVersion}`;

  const {
    bridgeRef,
    ensureChannel,
    runtimeState,
    sendAudio,
    sendBinaryOnChannel,
    sendChat,
    sendFile,
    sendOnChannel,
    sendRenderError,
    sendWithAckOnChannel,
    setViewMode,
    viewMode,
  } = useLiveTransport({
    slug,
    enabled,
    transportKey,
    agentAnswer: liveEnabled && sessionState === "active" ? live?.agentAnswer : undefined,
    agentCandidates: liveEnabled && sessionState === "active" ? live?.agentCandidates : undefined,
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
    onPubFsMessageRef: pubFsMessageHandlerRef,
  });

  const errorThrottle = useErrorThrottle();

  const handleRenderError = useCallback(
    (payload: LiveRenderErrorPayload) => {
      errorThrottle.recordError();
      if (!errorThrottle.paused) {
        sendRenderError(payload);
      }
      addSystemMessage({
        content: payload.message,
        severity: "error",
        dedupeKey: `canvas-error:${payload.message}`,
        details: formatRenderErrorDetails(payload),
      });
    },
    [addSystemMessage, errorThrottle, sendRenderError],
  );

  const profileStartedRef = useRef(false);

  useEffect(() => {
    if (liveEnabled && agentOnline === true && !profileStartedRef.current) {
      profileStartedRef.current = true;
      profileStart();
      profileMark("queries-resolved");
    }
    if (!liveEnabled || agentOnline !== true) {
      profileStartedRef.current = false;
    }
  }, [liveEnabled, agentOnline]);

  useEffect(() => {
    if (enabled) profileMark("enabled");
  }, [enabled]);

  useEffect(() => {
    if (sessionState === "active") profileMark("session-active");
  }, [sessionState]);

  useEffect(() => {
    if (canSendAgentTraffic(runtimeState) && profileStartedRef.current) {
      profilePrint();
      profileStartedRef.current = false;
    }
  }, [runtimeState]);

  const {
    command,
    handleBridgeCommandMessage,
    onCanvasBridgeMessage,
    outboundCanvasBridgeMessage,
    reset: resetCanvasCommands,
  } = useCanvasCommands({
    sendWithAckOnChannel,
    ensureChannel,
    canvasScopeKey,
    runtimeState,
    liveMode: liveEnabled,
    sessionKey: transportKey,
    commandsPaused: errorThrottle.paused,
  });
  commandMessageHandlerRef.current = handleBridgeCommandMessage;

  const {
    setIframeWindow,
    handlePubFsChannelMessage,
    ready: pubFsBridgeReady,
  } = usePubFsBridge({
    bridgeRef,
    enabled: liveEnabled,
    ensureChannel,
  });
  pubFsMessageHandlerRef.current = handlePubFsChannelMessage;

  const sandboxOrigin = import.meta.env.VITE_SANDBOX_ORIGIN as string;
  const sandboxUrl = useMemo(() => {
    const sessionId = (liveEnabled ? transportKey : `${slug}:owner`).replace(/[^a-zA-Z0-9-]/g, "_");
    return `${sandboxOrigin}/__canvas__/${sessionId}/`;
  }, [liveEnabled, slug, transportKey]);

  const audio = useControlBarAudio({
    disabled: runtimeState.connectionState !== "connected" || runtimeState.agentState !== "ready",
    sendOnChannel,
    sendBinaryOnChannel,
    ensureChannel,
    onSendAudio: sendAudio,
    onSystemMessage: addSystemMessage,
  });

  const { preview, dismissPreview } = useChatPreview(messages, viewMode);

  useEffect(() => {
    setCanvasHtml(baseContentHtml ?? null);
  }, [baseContentHtml]);

  useEffect(() => {
    if (contentAccessState === "loading") return;
    if (contentAccessState === "missing") {
      setContentBaseUrl(null);
      return;
    }
    if (contentAccessState === "public") {
      setContentBaseUrl(publicContentBaseUrl);
      return;
    }

    let canceled = false;
    setContentBaseUrl(null);
    void createOwnerContentAccessToken({ slug })
      .then((result) => {
        if (canceled) return;
        setContentBaseUrl(
          `${getConvexSiteUrl()}/serve-private/${encodeURIComponent(slug)}/${encodeURIComponent(result.token)}/`,
        );
      })
      .catch((error) => {
        if (canceled) return;
        const detail =
          error instanceof Error && error.message.trim().length > 0
            ? ` ${error.message.trim()}`
            : "";
        addSystemMessage({
          content: `Failed to prepare content runtime.${detail}`,
          dedupeKey: `content-runtime:${slug}`,
          severity: "error",
        });
      });

    return () => {
      canceled = true;
    };
  }, [
    addSystemMessage,
    contentAccessState,
    createOwnerContentAccessToken,
    publicContentBaseUrl,
    slug,
  ]);

  const hadCanvasRef = useRef(Boolean(canvasHtml));
  useEffect(() => {
    const hadCanvas = hadCanvasRef.current;
    hadCanvasRef.current = Boolean(canvasHtml);
    if (canvasHtml && !hadCanvas) {
      setCollapsePreference(liveStartPolicy.defaultCollapsed);
    }
  }, [canvasHtml, liveStartPolicy.defaultCollapsed]);

  const previousAutoStartAvailableRef = useRef(liveStartPolicy.autoStartAvailable);
  useEffect(() => {
    const previousAutoStartAvailable = previousAutoStartAvailableRef.current;
    previousAutoStartAvailableRef.current = liveStartPolicy.autoStartAvailable;

    if (!canvasHtml || !hasCommandManifest) return;
    if (!previousAutoStartAvailable && liveStartPolicy.autoStartAvailable) {
      setCollapsePreference(true);
    }
  }, [canvasHtml, hasCommandManifest, liveStartPolicy.autoStartAvailable]);

  const previousRequiresUserActionRef = useRef(liveStartPolicy.requiresUserAction);
  useEffect(() => {
    const previousRequiresUserAction = previousRequiresUserActionRef.current;
    previousRequiresUserActionRef.current = liveStartPolicy.requiresUserAction;

    if (!canvasHtml || !hasCommandManifest) return;
    if (!previousRequiresUserAction && liveStartPolicy.requiresUserAction) {
      setCollapsePreference(false);
      return;
    }
    if (previousRequiresUserAction && !liveStartPolicy.requiresUserAction) {
      setCollapsePreference(liveStartPolicy.defaultCollapsed);
    }
  }, [
    canvasHtml,
    hasCommandManifest,
    liveStartPolicy.defaultCollapsed,
    liveStartPolicy.requiresUserAction,
  ]);

  useEffect(() => {
    const previous = lastCanvasScopeRef.current;
    if (previous.slug === slug && previous.html === canvasHtml) return;
    const hadPriorCanvas = previous.html !== null;
    lastCanvasScopeRef.current = { slug, html: canvasHtml };
    if (hadPriorCanvas) {
      setCanvasScopeVersion((current) => current + 1);
    }
    errorThrottle.reset();
  }, [canvasHtml, errorThrottle, slug]);

  const effectiveContentState = canvasHtml ? "ready" : contentState;
  const hasCanvasContent = Boolean(canvasHtml);
  const needsAgentSelection = availableAgents.length > 1 && selectedHostId === null;
  const viewState = derivePubViewState({
    agentActivity: runtimeState.agentActivity,
    agentOnline,
    audioMode: audio.machineMode,
    command,
    connectionState: runtimeState.connectionState,
    contentState: effectiveContentState,
    liveMode: liveEnabled,
    needsAgentSelection,
    sessionError,
    sessionState,
  });

  const controlBarCollapsed =
    hasCanvasContent && collapsePreference && isControlBarCollapsible(viewState.controlBarState);

  const toggleControlBar = useCallback(() => {
    if (!hasCanvasContent) return;
    setCollapsePreference((prev) => !prev);
  }, [hasCanvasContent]);

  const collapseControlBar = useCallback(() => {
    if (!hasCanvasContent) return;
    setCollapsePreference(true);
  }, [hasCanvasContent]);

  const requestLiveSession = useCallback(() => {
    setLiveRequestedOverride(true);
    if (hasCanvasContent) {
      setCollapsePreference(false);
    }
  }, [hasCanvasContent]);

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
    if (!pub || trackedAnalytics.current) return;
    trackedAnalytics.current = true;
    trackPubViewed({
      slug: pub.slug,
      isPublic: pub.isPublic,
    });
    void recordPubView({ slug: pub.slug });
  }, [pub, recordPubView]);

  useEffect(() => {
    if (lastSlugRef.current === null) {
      lastSlugRef.current = slug;
      return;
    }
    if (lastSlugRef.current === slug) return;
    lastSlugRef.current = slug;
    lastSessionErrorRef.current = null;
    lastReportedCommandErrorRef.current = null;
    notifiedStatusRef.current = null;
    lastLiveBrowserSessionIdRef.current = null;
    lastSelectedHostIdRef.current = null;
    const resetLiveStartPolicy = deriveLiveStartPolicy({
      availableAgentCount: availableAgents.length,
      hasCanvasContent: Boolean(baseContentHtml),
      hasCommandManifest: hasBaseCommandManifest,
      liveRequested: defaultLiveRequested,
      selectedHostId,
    });
    previousAutoStartAvailableRef.current = resetLiveStartPolicy.autoStartAvailable;
    previousRequiresUserActionRef.current = resetLiveStartPolicy.requiresUserAction;
    setCanvasHtml(baseContentHtml ?? null);
    setCollapsePreference(resetLiveStartPolicy.defaultCollapsed);
    setLiveRequestedOverride(null);
    trackedAnalytics.current = false;
    dismissPreview();
    clearMessages();
    clearFiles();
    resetCanvasCommands();
    resetSession();
  }, [
    baseContentHtml,
    slug,
    availableAgents.length,
    defaultLiveRequested,
    hasBaseCommandManifest,
    selectedHostId,
    dismissPreview,
    clearMessages,
    clearFiles,
    resetCanvasCommands,
    resetSession,
  ]);

  useEffect(() => {
    if (runtimeState.connectionState === "connected") markBridgeConnected();
  }, [markBridgeConnected, runtimeState.connectionState]);

  useEffect(() => {
    const previousCanvasHtml = lastCanvasHtmlRef.current;
    lastCanvasHtmlRef.current = canvasHtml;
    if (!liveEnabled || !autoOpenCanvas) return;
    if (!canvasHtml || canvasHtml === previousCanvasHtml) return;
    setViewMode("canvas");
  }, [autoOpenCanvas, canvasHtml, liveEnabled, setViewMode]);

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

  useEffect(() => {
    if (command.phase !== "failed" || !command.errorMessage || !command.finishedAt) return;
    if (lastReportedCommandErrorRef.current === command.finishedAt) return;
    lastReportedCommandErrorRef.current = command.finishedAt;
    errorThrottle.recordError();
    const name = command.activeCommandName;
    addSystemMessage({
      content: name
        ? `Command "${name}" failed: ${command.errorMessage}`
        : `Command failed: ${command.errorMessage}`,
      severity: "error",
    });
  }, [
    addSystemMessage,
    command.activeCommandName,
    command.errorMessage,
    command.finishedAt,
    command.phase,
    errorThrottle,
  ]);

  const resetLiveSurface = useCallback(() => {
    dismissPreview();
    clearFiles();
    clearMessages();
    clearSessionError();
    errorThrottle.reset();
    // Command lifecycle is keyed separately by sessionKey/canvasScopeKey.
    setCanvasHtml(baseContentHtml ?? null);
    setViewMode("canvas");
  }, [
    baseContentHtml,
    clearFiles,
    clearMessages,
    clearSessionError,
    dismissPreview,
    errorThrottle,
    setViewMode,
  ]);

  useEffect(() => {
    if (!liveEnabled) {
      lastLiveBrowserSessionIdRef.current = null;
      return;
    }

    const nextLiveBrowserSessionId = live?.browserSessionId ?? null;
    const previousLiveBrowserSessionId = lastLiveBrowserSessionIdRef.current;

    if (nextLiveBrowserSessionId !== null) {
      lastLiveBrowserSessionIdRef.current = nextLiveBrowserSessionId;
    }

    if (
      previousLiveBrowserSessionId === null ||
      nextLiveBrowserSessionId === null ||
      previousLiveBrowserSessionId === nextLiveBrowserSessionId
    ) {
      return;
    }

    resetLiveSurface();
  }, [live?.browserSessionId, liveEnabled, resetLiveSurface]);

  useEffect(() => {
    if (!liveEnabled) {
      lastSelectedHostIdRef.current = null;
      return;
    }

    const previousHostId = lastSelectedHostIdRef.current;
    lastSelectedHostIdRef.current = selectedHostId;

    if (previousHostId === null || previousHostId === selectedHostId) {
      return;
    }

    resetLiveSurface();
  }, [liveEnabled, resetLiveSurface, selectedHostId]);

  const handleClose = useCallback(() => {
    setCollapsePreference(false);
    setLiveRequestedOverride(false);
    resetLiveSurface();
    if (liveEnabled) closeLive();
    void navigate({ to: "/pubs" });
  }, [closeLive, liveEnabled, navigate, resetLiveSurface]);

  const handleSelectedHostId = useCallback(
    (hostId: typeof selectedHostId) => {
      if (hostId === selectedHostId) return;
      setSelectedHostId(hostId);
    },
    [selectedHostId, setSelectedHostId],
  );

  return {
    agentName: live?.agentName ?? null,
    agentOnline,
    audio,
    availableAgents,
    addSystemMessage,
    autoFullscreen,
    autoOpenCanvas,
    agentState: runtimeState.agentState,
    defaultAgentName,
    canvasHtml,
    canUseDeveloperMode,
    clearFiles,
    clearMessages,
    clearSessionError,
    collapseControlBar,
    closeLive: handleClose,
    command,
    connected: canSendAgentTraffic(runtimeState),
    contentBaseUrl,
    contentState: effectiveContentState,
    controlBarCollapsed,
    controlBarState: viewState.controlBarState,
    developerModeEnabled,
    dismissPreview,
    error: viewState.error,
    errorThrottle,
    files,
    hasCommandManifest,
    hasCanvasContent,
    connectionState: runtimeState.connectionState,
    executorState: runtimeState.executorState,
    lastTakeoverAt,
    live,
    messages,
    messagesEndRef,
    onCanvasBridgeMessage,
    onIframeWindow: setIframeWindow,
    outboundCanvasBridgeMessage,
    preview,
    liveRequested,
    optionalLive: liveStartPolicy.optionalLive,
    requestLiveSession,
    retryConnection,
    sendAudio,
    sendChat,
    sendFile,
    handleRenderError,
    sessionState,
    selectedHostId,
    setAutoFullscreen,
    setAutoOpenCanvas,
    setDefaultAgentName,
    toggleControlBar,
    setDeveloperModeEnabled,
    setSelectedHostId: handleSelectedHostId,
    setViewMode,
    setVoiceModeEnabled,
    takeoverLive,
    transportStatus: viewState.transportStatus,
    viewMode,
    sandboxUrl,
    pubFsBridgeReady,
    blobState: viewState.blobState,
    voiceModeEnabled,
  };
}
