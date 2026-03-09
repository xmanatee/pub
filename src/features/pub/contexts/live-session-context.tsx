import { createContext, ReactNode, useContext } from "react";
import { UsePubLiveModelOptions, usePubLiveModel } from "../hooks/use-pub-live-model";

export type LiveSessionContextType = ReturnType<typeof usePubLiveModel>;

const LiveSessionContext = createContext<LiveSessionContextType | null>(null);

export interface LiveSessionProviderProps {
  slug?: string;
  pub?: UsePubLiveModelOptions["pub"];
  baseContentHtml?: string | null;
  value?: LiveSessionContextType;
  children: ReactNode;
}

export function LiveSessionProvider({
  slug,
  pub,
  baseContentHtml,
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
    <InternalLiveSessionProvider slug={slug} pub={pub} baseContentHtml={baseContentHtml}>
      {children}
    </InternalLiveSessionProvider>
  );
}

function InternalLiveSessionProvider({
  slug,
  pub,
  baseContentHtml,
  children,
}: {
  slug: string;
  pub?: UsePubLiveModelOptions["pub"];
  baseContentHtml?: string | null;
  children: ReactNode;
}) {
  const model = usePubLiveModel({ slug, pub, baseContentHtml });
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
      mode: "idle",
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
    canvasHtml: null,
    clearFiles: noop,
    clearMessages: noop,
    canUseDeveloperMode: true,
    closeLive: noop,
    connected: true,
    controlBarCollapsed: false,
    developerModeEnabled: false,
    dismissPreview: noop,
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
    sendAudio: noop,
    sendChat: noop,
    sendFile: noop,
    sendRenderError: noop,
    sessionState: "active",
    sessionError: null,
    selectedPresenceId: null,
    setSelectedPresenceId: noop,
    setAutoOpenCanvas: noop,
    setControlBarCollapsed: noop,
    setDeveloperModeEnabled: noop,
    setMicGranted: noop,
    setViewMode: noop,
    setVoiceModeEnabled: noop,
    takeoverLive: async () => {},
    uiState: "idle",
    viewMode: "canvas",
    visualState: "idle",
    voiceModeEnabled: true,
    ...overrides,
  } as LiveSessionContextType;
}
