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
  setSelectedHostIdMock,
  setViewModeMock,
  sharedPreviewState,
  sharedState,
  sharedTransportState,
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
  setSelectedHostIdMock: vi.fn(),
  setViewModeMock: vi.fn(),
  sharedPreviewState: {
    preview: null as null | {
      source: "agent" | "system";
      severity?: "error" | "warning";
      text: string;
    },
  },
  sharedState: {
    availableAgents: [{ hostId: "presence-1", agentName: "Agent" }] as Array<{
      hostId: string;
      agentName: string;
    }>,
    live: null as {
      _id: string;
      agentAnswer?: string;
      agentCandidates: string[];
      browserSessionId?: string;
    } | null,
    selectedHostId: "presence-1" as string | null,
  },
  sharedTransportState: {
    agentActivity: "idle" as "idle" | "thinking" | "streaming",
    agentState: "idle" as "idle" | "preparing" | "ready",
    connectionState: "idle" as "idle" | "connecting" | "connected" | "disconnected" | "failed",
    executorState: "idle" as "idle" | "loading" | "ready",
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
    extractManifestFromHtml: (html?: string | null) =>
      html?.includes('type="application/pub-command-manifest+json"') ? { commands: [] } : null,
  };
});

vi.mock("~/features/live/hooks/use-live-session-model", () => ({
  useLiveSessionModel: (_slug: string, _defaultAgentName: string | null) => ({
    availableAgents: sharedState.availableAgents,
    agentOnline: sharedState.availableAgents.length > 0,
    clearSessionError: clearSessionErrorMock,
    closeLive: closeLiveMock,
    connectionAttempt: 0,
    lastTakeoverAt: undefined,
    live: sharedState.live,
    markBridgeConnected: markBridgeConnectedMock,
    resetSession: resetSessionMock,
    retryConnection: retryConnectionMock,
    sessionError: null,
    sessionState: "active",
    selectedHostId: sharedState.selectedHostId,
    setSelectedHostId: setSelectedHostIdMock,
    storeBrowserCandidates: storeBrowserCandidatesMock,
    storeBrowserOffer: storeBrowserOfferMock,
    takeoverLive: takeoverLiveMock,
  }),
}));

vi.mock("~/features/live/hooks/use-live-preferences", () => ({
  useLivePreferences: () => ({
    autoFullscreen: true,
    autoOpenCanvas: false,
    defaultAgentName: null,
    setAutoFullscreen: vi.fn(),
    setAutoOpenCanvas: vi.fn(),
    setDefaultAgentName: vi.fn(),
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
    preview: sharedPreviewState.preview,
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
    bridgeRef: { current: null },
    ensureChannel: vi.fn(async () => true),
    runtimeState: sharedTransportState,
    sendAudio: vi.fn(),
    sendChat: vi.fn(),
    sendFile: vi.fn(),
    sendRenderError: vi.fn(),
    sendWithAckOnChannel: vi.fn(async () => true),
    setViewMode: setViewModeMock,
    viewMode: "canvas",
  }),
}));

vi.mock("~/features/live/hooks/use-pub-fs-bridge", () => ({
  usePubFsBridge: () => ({
    setIframeWindow: vi.fn(),
    handlePubFsChannelMessage: vi.fn(),
    ready: true,
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
  baseContentHtml = `<!DOCTYPE html>
<html>
<body>
  <script type="application/pub-command-manifest+json">
  { "manifestId": "test-manifest", "functions": [] }
  </script>
</body>
</html>`,
  contentState = "ready",
  onChange,
}: {
  baseContentHtml?: string | null;
  contentState?: "loading" | "empty" | "ready";
  onChange: (value: ReturnType<typeof usePubLiveModel>) => void;
}) {
  const value = usePubLiveModel({
    slug: "email-tinder",
    pub: { isOwner: true, isPublic: false, slug: "email-tinder" },
    baseContentHtml,
    contentState,
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
    vi.stubEnv("VITE_CONVEX_URL", "https://silent-guanaco-514.convex.cloud");
    sharedState.availableAgents = [{ hostId: "presence-1", agentName: "Agent" }];
    sharedState.live = null;
    sharedState.selectedHostId = "presence-1";
    sharedTransportState.agentActivity = "idle";
    sharedTransportState.agentState = "idle";
    sharedTransportState.connectionState = "idle";
    sharedTransportState.executorState = "idle";
    addSystemMessageMock.mockReset();
    clearFilesMock.mockReset();
    clearMessagesMock.mockReset();
    clearSessionErrorMock.mockReset();
    closeLiveMock.mockReset();
    dismissPreviewMock.mockReset();
    markBridgeConnectedMock.mockReset();
    mutationMock.mockReset();
    mutationMock.mockImplementation(async () => ({
      token: "owner-token",
      expiresAt: Date.now() + 1_000,
    }));
    navigateMock.mockReset();
    resetCanvasCommandsMock.mockReset();
    resetSessionMock.mockReset();
    retryConnectionMock.mockReset();
    setSelectedHostIdMock.mockReset();
    setViewModeMock.mockReset();
    sharedPreviewState.preview = null;
    storeBrowserCandidatesMock.mockReset();
    storeBrowserOfferMock.mockReset();
    takeoverLiveMock.mockReset();
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
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

  it("collapses a manifest pub once exactly one agent becomes available", async () => {
    const states: Array<ReturnType<typeof usePubLiveModel>> = [];

    sharedState.availableAgents = [];
    sharedState.selectedHostId = null;

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      const currentRoot = root;
      if (!currentRoot) throw new Error("root not initialized");
      currentRoot.render(<HookHarness onChange={(value) => states.push(value)} />);
    });

    expect(states.at(-1)?.controlBarCollapsed).toBe(false);

    sharedState.availableAgents = [{ hostId: "presence-1", agentName: "Agent" }];
    sharedState.selectedHostId = "presence-1";

    await act(async () => {
      const currentRoot = root;
      if (!currentRoot) throw new Error("root not initialized");
      currentRoot.render(<HookHarness onChange={(value) => states.push(value)} />);
    });

    expect(states.at(-1)?.controlBarCollapsed).toBe(true);
    expect(states.at(-1)?.liveRequested).toBe(true);
  });

  it("collapses a manifest pub after agent selection is resolved", async () => {
    const states: Array<ReturnType<typeof usePubLiveModel>> = [];

    sharedState.availableAgents = [
      { hostId: "presence-1", agentName: "Agent 1" },
      { hostId: "presence-2", agentName: "Agent 2" },
    ];
    sharedState.selectedHostId = null;

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      const currentRoot = root;
      if (!currentRoot) throw new Error("root not initialized");
      currentRoot.render(<HookHarness onChange={(value) => states.push(value)} />);
    });

    expect(states.at(-1)?.controlBarCollapsed).toBe(false);

    sharedState.selectedHostId = "presence-1";

    await act(async () => {
      const currentRoot = root;
      if (!currentRoot) throw new Error("root not initialized");
      currentRoot.render(<HookHarness onChange={(value) => states.push(value)} />);
    });

    expect(states.at(-1)?.controlBarCollapsed).toBe(true);
  });

  it("auto-requests live for empty pubs", async () => {
    const states: Array<ReturnType<typeof usePubLiveModel>> = [];

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      const currentRoot = root;
      if (!currentRoot) throw new Error("root not initialized");
      currentRoot.render(
        <HookHarness
          baseContentHtml={null}
          contentState="empty"
          onChange={(value) => states.push(value)}
        />,
      );
    });

    expect(states.at(-1)?.liveRequested).toBe(true);
    expect(states.at(-1)?.optionalLive).toBe(false);
    expect(states.at(-1)?.controlBarCollapsed).toBe(false);
  });

  it("does not latch an early empty state into live mode for static pubs", async () => {
    const states: Array<ReturnType<typeof usePubLiveModel>> = [];

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      const currentRoot = root;
      if (!currentRoot) throw new Error("root not initialized");
      currentRoot.render(
        <HookHarness
          baseContentHtml={null}
          contentState="loading"
          onChange={(value) => states.push(value)}
        />,
      );
    });

    await act(async () => {
      const currentRoot = root;
      if (!currentRoot) throw new Error("root not initialized");
      currentRoot.render(
        <HookHarness
          baseContentHtml="<html><body>static</body></html>"
          contentState="ready"
          onChange={(value) => states.push(value)}
        />,
      );
    });

    expect(states.at(-1)?.liveRequested).toBe(false);
    expect(states.at(-1)?.optionalLive).toBe(true);
  });

  it("enters live mode when a static owner pub explicitly requests it", async () => {
    const states: Array<ReturnType<typeof usePubLiveModel>> = [];

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      const currentRoot = root;
      if (!currentRoot) throw new Error("root not initialized");
      currentRoot.render(
        <HookHarness
          baseContentHtml="<html><body>static</body></html>"
          contentState="ready"
          onChange={(value) => states.push(value)}
        />,
      );
    });

    const initialState = states.at(-1);
    if (!initialState) throw new Error("hook did not emit state");
    expect(initialState.liveRequested).toBe(false);
    expect(initialState.optionalLive).toBe(true);

    await act(async () => {
      initialState.requestLiveSession();
    });

    expect(states.at(-1)?.liveRequested).toBe(true);
    expect(states.at(-1)?.optionalLive).toBe(false);
  });

  it("adopts the empty-pub default after loading completes", async () => {
    const states: Array<ReturnType<typeof usePubLiveModel>> = [];

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      const currentRoot = root;
      if (!currentRoot) throw new Error("root not initialized");
      currentRoot.render(
        <HookHarness
          baseContentHtml={null}
          contentState="loading"
          onChange={(value) => states.push(value)}
        />,
      );
    });

    await act(async () => {
      const currentRoot = root;
      if (!currentRoot) throw new Error("root not initialized");
      currentRoot.render(
        <HookHarness
          baseContentHtml={null}
          contentState="empty"
          onChange={(value) => states.push(value)}
        />,
      );
    });

    expect(states.at(-1)?.liveRequested).toBe(true);
    expect(states.at(-1)?.optionalLive).toBe(false);
  });

  it("returns sandboxUrl using VITE_SANDBOX_ORIGIN for owner content", async () => {
    const prev = import.meta.env.VITE_SANDBOX_ORIGIN;
    import.meta.env.VITE_SANDBOX_ORIGIN = "https://sandbox.test";

    const states: Array<ReturnType<typeof usePubLiveModel>> = [];

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      const currentRoot = root;
      if (!currentRoot) throw new Error("root not initialized");
      currentRoot.render(
        <HookHarness
          baseContentHtml="<html><body>static</body></html>"
          contentState="ready"
          onChange={(value) => states.push(value)}
        />,
      );
    });

    expect(states.at(-1)?.sandboxUrl).toBe("https://sandbox.test/__canvas__/email-tinder_owner/");
    expect(states.at(-1)?.contentBaseUrl).toBe(
      "https://silent-guanaco-514.convex.site/serve-private/email-tinder/owner-token/",
    );

    import.meta.env.VITE_SANDBOX_ORIGIN = prev;
  });

  it("only reports connected when agent traffic is sendable", async () => {
    const states: Array<ReturnType<typeof usePubLiveModel>> = [];

    sharedTransportState.connectionState = "connected";
    sharedTransportState.agentState = "preparing";

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      const currentRoot = root;
      if (!currentRoot) throw new Error("root not initialized");
      currentRoot.render(<HookHarness onChange={(value) => states.push(value)} />);
    });

    const currentValue = states.at(-1);
    if (!currentValue) throw new Error("hook value not captured");
    expect(currentValue.connected).toBe(false);

    sharedTransportState.agentState = "ready";

    await act(async () => {
      const currentRoot = root;
      if (!currentRoot) throw new Error("root not initialized");
      currentRoot.render(<HookHarness onChange={(value) => states.push(value)} />);
    });

    const nextValue = states.at(-1);
    if (!nextValue) throw new Error("hook value not captured after rerender");
    expect(nextValue.connected).toBe(true);
  });
});
