/** @vitest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ControlBarProvider } from "~/components/control-bar/control-bar-controller";
import { TooltipProvider } from "~/components/ui/tooltip";
import { createLiveBlobPresentation } from "~/features/live/blob/live-blob-presentation";
import type { LiveSessionContextType } from "~/features/pub/contexts/live-session-context";
import { ControlBar } from "./control-bar";

(
  globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  }
).IS_REACT_ACT_ENVIRONMENT = true;

const mockSession = {
  agentName: null as string | null,
  agentOnline: true,
  availableAgents: [],
  audio: {
    barMode: "idle",
    machineMode: "idle",
    elapsed: 0,
    barsRef: { current: null },
    cancelRecording: vi.fn(),
    pauseRecording: vi.fn(),
    resumeRecording: vi.fn(),
    sendRecording: vi.fn(),
    startRecording: vi.fn(),
    startVoiceMode: vi.fn(),
    stopVoiceMode: vi.fn(),
  },
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
  canvasHtml: null as string | null,
  dismissPreview: vi.fn(),
  hasCanvasContent: true,
  hasCommandManifest: false,
  lastTakeoverAt: undefined as number | undefined,
  liveRequested: true,
  optionalLive: false,
  preview: null,
  requestLiveSession: vi.fn(),
  retryConnection: vi.fn(),
  toggleControlBar: vi.fn(),
  setSelectedPresenceId: vi.fn(),
  setViewMode: vi.fn(),
  sendAudio: vi.fn(),
  sendChat: vi.fn(),
  sendFile: vi.fn(),
  sessionState: "active",
  takeoverLive: vi.fn(),
  transportStatus: "connected",
  viewMode: "canvas",
  blobState: "idle",
  voiceModeEnabled: false,
  closeLive: vi.fn(),
} as unknown as LiveSessionContextType;

type AudioOverrides = Partial<typeof mockSession.audio>;
type RenderOverrides = Omit<Partial<typeof mockSession>, "audio"> & { audio?: AudioOverrides };

const mockExtendedOptions = { visible: false, dismiss: vi.fn(), toggle: vi.fn() };

let root: Root | null = null;
let container: HTMLDivElement | null = null;

vi.mock("~/features/pub/contexts/live-session-context", () => ({
  useLiveSession: () => mockSession,
}));

vi.mock("~/features/live-control-bar/hooks/use-extended-options-visibility", () => ({
  useExtendedOptionsVisibility: () => mockExtendedOptions,
}));

vi.mock("~/features/live-control-bar/hooks/use-control-bar-text", () => ({
  useControlBarText: () => ({
    input: "",
    setInput: vi.fn(),
    hasText: false,
    handleSend: vi.fn(),
    handleKeyDown: vi.fn(),
  }),
}));

vi.mock("~/features/live-control-bar/hooks/use-file-upload", () => ({
  useFileUpload: () => ({
    fileInputRef: { current: null },
    handleFile: vi.fn(),
  }),
}));

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
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

async function renderControlBar(
  overrides?: RenderOverrides,
  hookOverrides?: Partial<typeof mockExtendedOptions>,
) {
  const { audio, ...sessionOverrides } = overrides ?? {};
  Object.assign(mockSession, sessionOverrides);
  if (audio) Object.assign(mockSession.audio, audio);
  Object.assign(mockExtendedOptions, {
    visible: false,
    dismiss: vi.fn(),
    toggle: vi.fn(),
    ...hookOverrides,
  });

  const currentRoot = root;
  const currentContainer = container;
  if (!currentRoot || !currentContainer) {
    throw new Error("test root not initialized");
  }

  const liveBlob = createLiveBlobPresentation(mockSession.blobState);

  await act(async () => {
    currentRoot.render(
      <TooltipProvider>
        <ControlBarProvider>
          <ControlBar
            shellTone={liveBlob.controlBarTone}
            statusButtonContent={liveBlob.statusButtonContent}
          />
        </ControlBarProvider>
      </TooltipProvider>,
    );
  });

  return currentContainer.innerHTML;
}

describe("ControlBar", () => {
  beforeEach(() => {
    mockSession.controlBarState = "idle";
    mockSession.controlBarCollapsed = false;
    mockSession.audio.barMode = "idle";
    mockSession.audio.machineMode = "idle";
    mockSession.audio.elapsed = 0;
    mockSession.viewMode = "canvas";
    mockSession.voiceModeEnabled = false;
    mockSession.preview = null;
    mockSession.agentName = null;
    mockSession.blobState = "idle";
    mockSession.hasCanvasContent = true;
    mockSession.hasCommandManifest = false;
    mockSession.liveRequested = true;
    mockSession.optionalLive = false;
  });

  it("shows record and voice actions in idle mode", async () => {
    const html = await renderControlBar();
    expect(html).toContain('aria-label="Record audio"');
    expect(html).not.toContain('aria-label="Voice mode"');

    const htmlWithVoice = await renderControlBar({ voiceModeEnabled: true });
    expect(htmlWithVoice).toContain('aria-label="Voice mode"');
  });

  it("shows recording controls in recording mode", async () => {
    const html = await renderControlBar({
      controlBarState: "recording",
      audio: { barMode: "recording", machineMode: "recording", elapsed: 9 },
    });
    expect(html).toContain('aria-label="Delete recording"');
    expect(html).toContain('aria-label="Pause recording"');
    expect(html).toContain('aria-label="Send recording"');
  });

  it("shows stop action in voice mode", async () => {
    const html = await renderControlBar({
      controlBarState: "voice-mode",
      audio: { barMode: "voice-mode", machineMode: "voice-mode" },
    });
    expect(html).toContain('aria-label="Stop voice mode"');
  });

  it("shows chat preview as addon when preview is provided", async () => {
    const html = await renderControlBar({
      agentName: "Agent",
      preview: { text: "Hello from agent", source: "agent" },
    });
    expect(html).toContain("Hello from agent");
    expect(html).toContain("Agent");
    expect(html).toContain('aria-label="Open chat"');
  });

  it("shows back button only outside canvas mode", async () => {
    const canvasHtml = await renderControlBar({ viewMode: "canvas" });
    expect(canvasHtml).not.toContain('aria-label="Back to canvas"');

    const chatHtml = await renderControlBar({ viewMode: "chat" });
    expect(chatHtml).toContain('aria-label="Back to canvas"');
  });

  it("does not render a menu button", async () => {
    const html = await renderControlBar();
    expect(html).not.toContain('aria-label="Open menu"');
    expect(html).not.toContain('aria-label="Close menu"');
  });

  it("includes extended options addon when hook reports visible", async () => {
    const html = await renderControlBar({}, { visible: true });
    expect(html).toContain("Chat view");
    expect(html).toContain("Settings");
    expect(html).toContain("Dashboard");
  });

  it("excludes extended options addon when hook reports not visible", async () => {
    const html = await renderControlBar({}, { visible: false });
    expect(html).not.toContain("Dashboard");
  });

  it("shows extended options and preview as separate addons simultaneously", async () => {
    const html = await renderControlBar(
      { agentName: "Agent", preview: { text: "Hello from agent", source: "agent" } },
      { visible: true },
    );
    expect(html).toContain("Chat view");
    expect(html).toContain("Dashboard");
    expect(html).toContain("Hello from agent");
    expect(html).toContain('aria-label="Open chat"');
  });

  it("shows backdrop when bar is expanded in canvas mode", async () => {
    const html = await renderControlBar({
      viewMode: "canvas",
      controlBarCollapsed: false,
    });
    expect(html).toContain('aria-label="Dismiss control bar"');
    expect(html).toContain("opacity-100");
  });

  it("hides backdrop when bar is collapsed", async () => {
    const html = await renderControlBar({
      viewMode: "canvas",
      controlBarCollapsed: true,
    });
    expect(html).toContain("pointer-events-none opacity-0");
  });

  it("hides backdrop in non-canvas view modes", async () => {
    const html = await renderControlBar({
      viewMode: "chat",
      controlBarCollapsed: false,
    });
    expect(html).toContain("pointer-events-none opacity-0");
  });

  it("always renders status dot toggle button", async () => {
    const html = await renderControlBar();
    expect(html).toContain('aria-label="Toggle control bar"');
  });

  it("uses the status button to toggle extended options when canvas is empty", async () => {
    const html = await renderControlBar({
      hasCanvasContent: false,
      liveRequested: false,
      optionalLive: true,
    });
    expect(html).toContain('aria-label="Toggle extended options"');
    expect(html).not.toContain('aria-label="Dismiss control bar"');
  });
});
