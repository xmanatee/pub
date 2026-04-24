import {
  type BridgeMessage,
  CONTROL_CHANNEL,
  makeTextMessage,
  parseAckMessage,
} from "@shared/bridge-protocol-core";
import { IDLE_LIVE_RUNTIME_STATE } from "@shared/live-runtime-state-core";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useErrorThrottle } from "~/features/live/hooks/use-error-throttle";
import { useLivePreferences } from "~/features/live/hooks/use-live-preferences";
import { useTunnelTransport } from "~/features/live/hooks/use-tunnel-transport";
import type { LiveCommandSummary, LiveViewMode } from "~/features/live/types/live-types";
import { useChatPreview } from "~/features/live-chat/hooks/use-chat-preview";
import { useLiveChatDelivery } from "~/features/live-chat/hooks/use-live-chat-delivery";
import { useLiveFiles } from "~/features/live-chat/hooks/use-live-files";
import { useControlBarAudio } from "~/features/live-control-bar/hooks/use-control-bar-audio";
import type { LiveSessionContextType } from "~/features/pub/contexts/live-session-context";
import { derivePubViewState, isControlBarCollapsible } from "~/features/pub/model/pub-view-state";

const IDLE_COMMAND: LiveCommandSummary = {
  activeCallId: null,
  activeCommandName: null,
  activeCount: 0,
  errorMessage: null,
  finishedAt: null,
  phase: "idle",
};

export function useTunnelLiveModel(
  tunnelWsUrl: string | null,
  agentName?: string,
): LiveSessionContextType {
  const transport = useTunnelTransport(tunnelWsUrl);
  const [viewMode, setViewMode] = useState<LiveViewMode>("canvas");
  const [collapsePreference, setCollapsePreference] = useState(false);

  const chatDelivery = useLiveChatDelivery();
  const { clearFiles, files } = useLiveFiles();
  const errorThrottle = useErrorThrottle();
  const { preview, dismissPreview } = useChatPreview(chatDelivery.messages, viewMode);
  const preferences = useLivePreferences();

  const runtimeState = useMemo(() => {
    if (!transport.agentStatus) return IDLE_LIVE_RUNTIME_STATE;
    return {
      connectionState: transport.connected ? ("connected" as const) : ("connecting" as const),
      agentState: transport.agentStatus.agentState ?? ("idle" as const),
      agentActivity: transport.agentStatus.agentActivity ?? ("idle" as const),
      executorState: transport.agentStatus.executorState ?? ("idle" as const),
    };
  }, [transport.agentStatus, transport.connected]);

  useEffect(() => {
    transport.onChannelMessage.current = (channel: string, msg: BridgeMessage) => {
      const ack = parseAckMessage(msg);
      if (ack) {
        chatDelivery.markMessageConfirmed(ack.messageId);
        return;
      }
      if (channel === CONTROL_CHANNEL) return;
      if (channel === "chat" && msg.type === "text" && typeof msg.data === "string") {
        chatDelivery.addAgentMessage({ content: msg.data, id: msg.id });
      }
    };
    return () => {
      transport.onChannelMessage.current = null;
    };
  }, [chatDelivery, transport.onChannelMessage]);

  const sendChat = useCallback(
    (text: string) => {
      const msg = makeTextMessage(text);
      chatDelivery.addUserPendingMessage({ content: text, id: msg.id });
      if (transport.sendOnChannel("chat", msg)) {
        chatDelivery.markMessageSentIfPending(msg.id);
      } else {
        chatDelivery.markMessageFailed(msg.id);
      }
    },
    [chatDelivery, transport],
  );

  const ensureChannel = useCallback(async () => transport.connected, [transport.connected]);

  const audio = useControlBarAudio({
    disabled: !transport.connected,
    sendOnChannel: (ch: string, msg: BridgeMessage) => transport.sendOnChannel(ch, msg),
    sendBinaryOnChannel: () => false,
    ensureChannel,
    onSendAudio: () => {},
    onSystemMessage: chatDelivery.addSystemMessage,
  });

  const viewState = derivePubViewState({
    agentActivity: runtimeState.agentActivity,
    agentOnline: transport.connected ? true : undefined,
    audioMode: audio.machineMode,
    command: IDLE_COMMAND,
    connectionState: transport.connected ? "connected" : "connecting",
    contentState: "ready",
    liveMode: true,
    needsAgentSelection: false,
    sessionError: null,
    sessionState: "active",
  });

  const controlBarCollapsed =
    collapsePreference && isControlBarCollapsible(viewState.controlBarState);

  const toggleControlBar = useCallback(() => setCollapsePreference((p) => !p), []);
  const collapseControlBar = useCallback(() => setCollapsePreference(true), []);
  const noop = useCallback(() => {}, []);

  return {
    agentName: agentName ?? null,
    agentOnline: transport.connected ? true : undefined,
    agentState: runtimeState.agentState,
    audio,
    autoFullscreen: preferences.autoFullscreen,
    autoOpenCanvas: preferences.autoOpenCanvas,
    availableAgents: [],
    addSystemMessage: chatDelivery.addSystemMessage,
    blobState: viewState.blobState,
    canUseDeveloperMode: false,
    canvasHtml: null,
    clearFiles,
    clearMessages: chatDelivery.clearMessages,
    clearSessionError: noop,
    closeLive: noop,
    collapseControlBar,
    command: IDLE_COMMAND,
    connected: transport.connected,
    connectionState: runtimeState.connectionState,
    contentBaseUrl: null,
    contentState: "ready",
    controlBarCollapsed,
    controlBarState: viewState.controlBarState,
    defaultAgentName: preferences.defaultAgentName,
    developerModeEnabled: false,
    dismissPreview,
    error: viewState.error,
    errorThrottle,
    executorState: runtimeState.executorState,
    files,
    handleRenderError: noop,
    hasCanvasContent: true,
    hasCommandManifest: false,
    lastTakeoverAt: undefined,
    live: undefined,
    liveRequested: true,
    messages: chatDelivery.messages,
    messagesEndRef: chatDelivery.messagesEndRef,
    onCanvasBridgeMessage: noop,
    onIframeWindow: noop,
    optionalLive: false,
    outboundCanvasBridgeMessage: null,
    preview,
    pubFsBridgeReady: false,
    requestLiveSession: noop,
    retryConnection: noop,
    sandboxUrl: "",
    selectedHostId: null,
    sendAudio: noop,
    sendChat,
    sendFile: noop,
    sessionState: "active",
    setAutoFullscreen: preferences.setAutoFullscreen,
    setAutoOpenCanvas: preferences.setAutoOpenCanvas,
    setDefaultAgentName: preferences.setDefaultAgentName,
    setDeveloperModeEnabled: noop,
    setSelectedHostId: noop,
    setViewMode,
    setVoiceModeEnabled: preferences.setVoiceModeEnabled,
    takeoverLive: async () => null,
    toggleControlBar,
    transportStatus: viewState.transportStatus,
    viewMode,
    voiceModeEnabled: preferences.voiceModeEnabled,
  };
}
