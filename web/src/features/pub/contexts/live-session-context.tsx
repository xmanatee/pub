import { createContext, ReactNode, useContext } from "react";
import { UsePubLiveModelOptions, usePubLiveModel } from "../hooks/use-pub-live-model";

export type LiveSessionContextType = ReturnType<typeof usePubLiveModel>;

const LiveSessionContext = createContext<LiveSessionContextType | null>(null);

export interface LiveSessionProviderProps {
  slug?: string;
  pub?: UsePubLiveModelOptions["pub"];
  baseContentHtml?: string | null;
  contentState?: UsePubLiveModelOptions["contentState"];
  value?: LiveSessionContextType;
  children: ReactNode;
}

export function LiveSessionProvider({
  slug,
  pub,
  baseContentHtml,
  contentState,
  value,
  children,
}: LiveSessionProviderProps) {
  if (value) {
    return <LiveSessionContext.Provider value={value}>{children}</LiveSessionContext.Provider>;
  }

  if (!slug) {
    throw new Error("Slug is required for LiveSessionProvider when no manual value is provided");
  }

  return (
    <InternalLiveSessionProvider
      slug={slug}
      pub={pub}
      baseContentHtml={baseContentHtml}
      contentState={contentState ?? "empty"}
    >
      {children}
    </InternalLiveSessionProvider>
  );
}

function InternalLiveSessionProvider({
  slug,
  pub,
  baseContentHtml,
  contentState,
  children,
}: {
  slug: string;
  pub?: UsePubLiveModelOptions["pub"];
  baseContentHtml?: string | null;
  contentState: UsePubLiveModelOptions["contentState"];
  children: ReactNode;
}) {
  const model = usePubLiveModel({ slug, pub, baseContentHtml, contentState });
  return <LiveSessionContext.Provider value={model}>{children}</LiveSessionContext.Provider>;
}

export function useLiveSession() {
  const context = useContext(LiveSessionContext);
  if (!context) {
    throw new Error("useLiveSession must be used within a LiveSessionProvider");
  }
  return context;
}

function createInertMessagesEndRef(): LiveSessionContextType["messagesEndRef"] {
  return {
    get current() {
      return null;
    },
    set current(_value: HTMLDivElement | null) {},
  } as LiveSessionContextType["messagesEndRef"];
}

export function createMockLiveSession(
  overrides: Partial<LiveSessionContextType> = {},
): LiveSessionContextType {
  const noop = () => {};
  const session = {
    agentName: "Agent",
    agentOnline: true,
    agentState: "ready",
    audio: {
      barMode: "idle",
      machineMode: "idle",
      elapsed: 0,
      barsRef: { current: null },
      cancelRecording: noop,
      pauseRecording: noop,
      resumeRecording: noop,
      sendRecording: noop,
      startRecording: async () => true,
      startVoiceMode: async () => {},
      stopVoiceMode: noop,
    },
    availableAgents: [],
    addSystemMessage: noop,
    autoOpenCanvas: false,
    canvasHtml: null,
    clearFiles: noop,
    clearMessages: noop,
    canUseDeveloperMode: true,
    collapseControlBar: noop,
    closeLive: noop,
    command: {
      activeCallId: null,
      activeCommandName: null,
      activeCount: 0,
      errorMessage: null,
      finishedAt: null,
      phase: "idle",
    },
    connected: true,
    contentState: "ready",
    controlBarCollapsed: false,
    controlBarState: "idle",
    developerModeEnabled: false,
    dismissPreview: noop,
    error: { message: null, source: "none" },
    files: [],
    clearSessionError: noop,
    connectionState: "connected",
    executorState: "ready",
    lastTakeoverAt: undefined,
    live: undefined,
    messages: [],
    messagesEndRef: createInertMessagesEndRef(),
    hasCanvasContent: false,
    onCanvasBridgeMessage: noop,
    outboundCanvasBridgeMessage: null,
    optionalLive: true,
    preview: null,
    retryConnection: noop,
    sendAudio: noop,
    sendChat: noop,
    sendFile: noop,
    handleRenderError: noop,
    hasCommandManifest: false,
    sessionState: "active",
    selectedPresenceId: null,
    liveRequested: false,
    requestLiveSession: noop,
    setSelectedPresenceId: noop,
    setAutoOpenCanvas: noop,
    toggleControlBar: noop,
    setDeveloperModeEnabled: noop,
    setViewMode: noop,
    setVoiceModeEnabled: noop,
    takeoverLive: async () => {},
    transportStatus: "connected",
    viewMode: "canvas",
    blobState: "idle",
    voiceModeEnabled: true,
    ...overrides,
  } as LiveSessionContextType;

  if (overrides.optionalLive === undefined) {
    session.optionalLive = !session.hasCommandManifest && !session.liveRequested;
  }

  return session;
}
