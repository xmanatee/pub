/** @vitest-environment jsdom */
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  addSystemMessageMock,
  clearFilesMock,
  clearMessagesMock,
  clearSessionErrorMock,
  closeLiveMock,
  dismissPreviewMock,
  markBridgeConnectedMock,
  mutationMock,
  navigateMock,
  resetCanvasCommandsMock,
  resetSessionMock,
  retryConnectionMock,
  setSelectedPresenceIdMock,
  setViewModeMock,
  sharedState,
  storeBrowserCandidatesMock,
  storeBrowserOfferMock,
  takeoverLiveMock,
} = vi.hoisted(() => ({
  addSystemMessageMock: vi.fn(),
  clearFilesMock: vi.fn(),
  clearMessagesMock: vi.fn(),
  clearSessionErrorMock: vi.fn(),
  closeLiveMock: vi.fn(),
  dismissPreviewMock: vi.fn(),
  markBridgeConnectedMock: vi.fn(),
  mutationMock: vi.fn(),
  navigateMock: vi.fn(),
  resetCanvasCommandsMock: vi.fn(),
  resetSessionMock: vi.fn(),
  retryConnectionMock: vi.fn(),
  setSelectedPresenceIdMock: vi.fn(),
  setViewModeMock: vi.fn(),
  sharedState: {
    live: null as {
      _id: string;
      agentAnswer?: string;
      agentCandidates: string[];
      browserSessionId?: string;
    } | null,
  },
  storeBrowserCandidatesMock: vi.fn(async () => ({})),
  storeBrowserOfferMock: vi.fn(async () => ({})),
  takeoverLiveMock: vi.fn(async () => ({})),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateMock,
}));

vi.mock("convex/react", () => ({
  useMutation: () => mutationMock,
}));

vi.mock("@shared/command-protocol-core", async () => {
  const actual = await vi.importActual<typeof import("@shared/command-protocol-core")>(
    "@shared/command-protocol-core",
  );
  return {
    ...actual,
    extractManifestFromHtml: (html?: string | null) => (html ? { commands: [] } : null),
  };
});

vi.mock("~/features/live/hooks/use-live-session-model", () => ({
  useLiveSessionModel: () => ({
    availableAgents: [{ presenceId: "presence-1", agentName: "Agent" }],
    agentOnline: true,
    clearSessionError: clearSessionErrorMock,
    closeLive: closeLiveMock,
    connectionAttempt: 0,
    live: sharedState.live,
    markBridgeConnected: markBridgeConnectedMock,
    resetSession: resetSessionMock,
    retryConnection: retryConnectionMock,
    sessionError: null,
    sessionState: "active",
    selectedPresenceId: "presence-1",
    setSelectedPresenceId: setSelectedPresenceIdMock,
    storeBrowserCandidates: storeBrowserCandidatesMock,
    storeBrowserOffer: storeBrowserOfferMock,
    takeoverLive: takeoverLiveMock,
  }),
}));

vi.mock("~/features/live/hooks/use-live-preferences", () => ({
  useLivePreferences: () => ({
    autoOpenCanvas: false,
    setAutoOpenCanvas: vi.fn(),
    setVoiceModeEnabled: vi.fn(),
    voiceModeEnabled: false,
  }),
}));

vi.mock("~/hooks/use-developer-mode", () => ({
  useDeveloperMode: () => ({
    canUseDeveloperMode: true,
    developerModeEnabled: false,
    setDeveloperModeEnabled: vi.fn(),
  }),
}));

vi.mock("~/features/live-chat/hooks/use-chat-preview", () => ({
  useChatPreview: () => ({
    dismissPreview: dismissPreviewMock,
    preview: null,
  }),
}));

vi.mock("~/features/live-chat/hooks/use-live-chat-delivery", () => ({
  useLiveChatDelivery: () => ({
    addAgentAudioMessage: vi.fn(),
    addAgentImageMessage: vi.fn(),
    addAgentMessage: vi.fn(),
    addSystemMessage: addSystemMessageMock,
    addUserPendingAttachmentMessage: vi.fn(),
    addUserPendingAudioMessage: vi.fn(),
    addUserPendingImageMessage: vi.fn(),
    addUserPendingMessage: vi.fn(),
    clearMessages: clearMessagesMock,
    failSentMessages: vi.fn(),
    markMessageConfirmed: vi.fn(),
    markMessageFailed: vi.fn(),
    markMessageFailedIfPending: vi.fn(),
    markMessageReceived: vi.fn(),
    markMessageSentIfPending: vi.fn(),
    messages: [],
    messagesEndRef: { current: null },
    updateAudioMessageAnalysis: vi.fn(),
  }),
}));

vi.mock("~/features/live-chat/hooks/use-live-files", () => ({
  useLiveFiles: () => ({
    addReceivedBinaryFile: vi.fn(),
    clearFiles: clearFilesMock,
    files: [],
  }),
}));

vi.mock("~/features/live-control-bar/hooks/use-control-bar-audio", () => ({
  useControlBarAudio: () => ({
    barMode: "idle",
    machineMode: "idle",
    elapsed: 0,
    barsRef: { current: null },
    cancelRecording: vi.fn(),
    pauseRecording: vi.fn(),
    resumeRecording: vi.fn(),
    sendRecording: vi.fn(),
    startRecording: vi.fn(async () => true),
    startVoiceMode: vi.fn(async () => {}),
    stopVoiceMode: vi.fn(),
  }),
}));

vi.mock("~/features/live/hooks/use-live-transport", () => ({
  useLiveTransport: () => ({
    ensureChannel: vi.fn(async () => true),
    runtimeState: {
      connectionState: "idle",
      agentState: "idle",
      executorState: "idle",
    },
    lastAgentOutput: null,
    lastUserDeliveredAt: null,
    sendAudio: vi.fn(),
    sendBinaryOnChannel: vi.fn(() => true),
    sendChat: vi.fn(),
    sendFile: vi.fn(),
    sendOnChannel: vi.fn(() => true),
    sendRenderError: vi.fn(),
    sendWithAckOnChannel: vi.fn(async () => true),
    setViewMode: setViewModeMock,
    viewMode: "canvas",
  }),
}));

vi.mock("~/features/live/hooks/use-canvas-commands", () => ({
  useCanvasCommands: () => ({
    command: {
      activeCallId: null,
      activeCommandName: null,
      activeCount: 0,
      errorMessage: null,
      finishedAt: null,
      phase: "idle",
    },
    handleBridgeCanvasFileMessage: vi.fn(),
    handleBridgeCommandMessage: vi.fn(),
    onCanvasBridgeMessage: vi.fn(),
    outboundCanvasBridgeMessage: null,
    reset: resetCanvasCommandsMock,
  }),
}));

import { usePubLiveModel } from "./use-pub-live-model";

(
  globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  }
).IS_REACT_ACT_ENVIRONMENT = true;

function HookHarness({
  onChange,
}: {
  onChange: (value: ReturnType<typeof usePubLiveModel>) => void;
}) {
  const value = usePubLiveModel({
    slug: "email-tinder",
    pub: { isOwner: true, isPublic: false, slug: "email-tinder" },
    baseContentHtml: "<html><body>manifest</body></html>",
    contentState: "ready",
  });

  useEffect(() => {
    onChange(value);
  }, [onChange, value]);

  return null;
}

describe("usePubLiveModel", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    sharedState.live = null;
    addSystemMessageMock.mockReset();
    clearFilesMock.mockReset();
    clearMessagesMock.mockReset();
    clearSessionErrorMock.mockReset();
    closeLiveMock.mockReset();
    dismissPreviewMock.mockReset();
    markBridgeConnectedMock.mockReset();
    mutationMock.mockReset();
    navigateMock.mockReset();
    resetCanvasCommandsMock.mockReset();
    resetSessionMock.mockReset();
    retryConnectionMock.mockReset();
    setSelectedPresenceIdMock.mockReset();
    setViewModeMock.mockReset();
    storeBrowserCandidatesMock.mockReset();
    storeBrowserOfferMock.mockReset();
    takeoverLiveMock.mockReset();
  });

  afterEach(async () => {
    const currentRoot = root;
    if (currentRoot) {
      await act(async () => {
        currentRoot.unmount();
      });
    }
    root = null;
    container?.remove();
    container = null;
  });

  it("does not reset the live surface when the live document changes but the browser session stays the same", async () => {
    const states: Array<ReturnType<typeof usePubLiveModel>> = [];

    sharedState.live = {
      _id: "live-old",
      agentCandidates: [],
      browserSessionId: "session-a",
    };

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      const currentRoot = root;
      if (!currentRoot) throw new Error("root not initialized");
      currentRoot.render(<HookHarness onChange={(value) => states.push(value)} />);
    });

    expect(resetCanvasCommandsMock).not.toHaveBeenCalled();

    sharedState.live = {
      _id: "live-new",
      agentCandidates: [],
      browserSessionId: "session-a",
    };

    await act(async () => {
      const currentRoot = root;
      if (!currentRoot) throw new Error("root not initialized");
      currentRoot.render(<HookHarness onChange={(value) => states.push(value)} />);
    });

    expect(states.at(-1)?.live?._id).toBe("live-new");
    expect(clearMessagesMock).not.toHaveBeenCalled();
    expect(clearFilesMock).not.toHaveBeenCalled();
    expect(clearSessionErrorMock).not.toHaveBeenCalled();
    expect(dismissPreviewMock).not.toHaveBeenCalled();
    expect(setViewModeMock).not.toHaveBeenCalled();
    expect(resetCanvasCommandsMock).not.toHaveBeenCalled();
  });

  it("resets the live surface when ownership changes to a different browser session", async () => {
    sharedState.live = {
      _id: "live-old",
      agentCandidates: [],
      browserSessionId: "session-a",
    };

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      const currentRoot = root;
      if (!currentRoot) throw new Error("root not initialized");
      currentRoot.render(<HookHarness onChange={() => {}} />);
    });

    sharedState.live = {
      _id: "live-new",
      agentCandidates: [],
      browserSessionId: "session-b",
    };

    await act(async () => {
      const currentRoot = root;
      if (!currentRoot) throw new Error("root not initialized");
      currentRoot.render(<HookHarness onChange={() => {}} />);
    });

    expect(clearMessagesMock).toHaveBeenCalledTimes(1);
    expect(clearFilesMock).toHaveBeenCalledTimes(1);
    expect(clearSessionErrorMock).toHaveBeenCalledTimes(1);
    expect(dismissPreviewMock).toHaveBeenCalledTimes(1);
    expect(setViewModeMock).toHaveBeenCalledWith("canvas");
    expect(resetCanvasCommandsMock).not.toHaveBeenCalled();
  });
});
