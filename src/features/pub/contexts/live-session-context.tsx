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

export function createMockLiveSession(
  overrides: Partial<LiveSessionContextType> = {},
): LiveSessionContextType {
  const noop = () => {};
  return {
    agentName: "Agent",
    agentOnline: true,
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
    bridgeRef: { current: null },
    bridgeState: "connected",
    canvasError: null,
    canvasHtml: null,
    clearFiles: noop,
    clearMessages: noop,
    canUseDeveloperMode: true,
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
    lastTakeoverAt: undefined,
    live: undefined,
    messages: [],
    messagesEndRef: { current: null },
    hasCanvasContent: false,
    micGranted: true,
    onCanvasBridgeMessage: noop,
    outboundCanvasBridgeMessage: null,
    preview: null,
    retryConnection: noop,
    sendAudio: noop,
    sendChat: noop,
    sendFile: noop,
    sendRenderError: noop,
    sessionState: "active",
    selectedPresenceId: null,
    setSelectedPresenceId: noop,
    setAutoOpenCanvas: noop,
    setCanvasError: noop,
    setControlBarCollapsed: noop,
    setDeveloperModeEnabled: noop,
    setMicGranted: noop,
    setViewMode: noop,
    setVoiceModeEnabled: noop,
    takeoverLive: async () => {},
    transportStatus: "connected",
    viewMode: "canvas",
    visualState: "idle",
    voiceModeEnabled: true,
    ...overrides,
  } as LiveSessionContextType;
}
