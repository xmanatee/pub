import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "~/components/ui/tooltip";
import type { LiveSessionContextType } from "~/features/pub/contexts/live-session-context";
import { ControlBar } from "./control-bar";

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
  lastTakeoverAt: undefined as number | undefined,
  preview: null,
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
  visualState: "idle",
  voiceModeEnabled: false,
  closeLive: vi.fn(),
} as unknown as LiveSessionContextType;

type AudioOverrides = Partial<typeof mockSession.audio>;
type RenderOverrides = Omit<Partial<typeof mockSession>, "audio"> & { audio?: AudioOverrides };

const mockExtendedOptions = { visible: false, dismiss: vi.fn() };

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

vi.mock("~/features/live-control-bar/hooks/use-hold-to-record", () => ({
  useHoldToRecord: () => ({
    pointerHandlers: {},
  }),
}));

function renderControlBar(
  overrides?: RenderOverrides,
  hookOverrides?: Partial<typeof mockExtendedOptions>,
) {
  const { audio, ...sessionOverrides } = overrides ?? {};
  Object.assign(mockSession, sessionOverrides);
  if (audio) Object.assign(mockSession.audio, audio);
  Object.assign(mockExtendedOptions, { visible: false, dismiss: vi.fn(), ...hookOverrides });

  return renderToStaticMarkup(
    <TooltipProvider>
      <ControlBar />
    </TooltipProvider>,
  );
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
  });

  it("shows hold-to-record and voice actions in idle mode", () => {
    const html = renderControlBar();
    expect(html).toContain('aria-label="Hold to record audio"');
    expect(html).not.toContain('aria-label="Voice mode"');

    const htmlWithVoice = renderControlBar({ voiceModeEnabled: true });
    expect(htmlWithVoice).toContain('aria-label="Voice mode"');
  });

  it("shows recording controls in recording mode", () => {
    const html = renderControlBar({
      controlBarState: "recording",
      audio: { barMode: "recording", machineMode: "recording", elapsed: 9 },
    });
    expect(html).toContain('aria-label="Delete recording"');
    expect(html).toContain('aria-label="Pause recording"');
    expect(html).toContain('aria-label="Send recording"');
  });

  it("shows stop action in voice mode", () => {
    const html = renderControlBar({
      controlBarState: "voice-mode",
      audio: { barMode: "voice-mode", machineMode: "voice-mode" },
    });
    expect(html).toContain('aria-label="Stop voice mode"');
  });

  it("shows chat preview as addon when preview is provided", () => {
    const html = renderControlBar({
      agentName: "Agent",
      preview: { text: "Hello from agent", source: "agent" },
    });
    expect(html).toContain("Hello from agent");
    expect(html).toContain("Agent");
    expect(html).toContain('aria-label="Open chat"');
  });

  it("shows back button only outside canvas mode", () => {
    const canvasHtml = renderControlBar({ viewMode: "canvas" });
    expect(canvasHtml).not.toContain('aria-label="Back to canvas"');

    const chatHtml = renderControlBar({ viewMode: "chat" });
    expect(chatHtml).toContain('aria-label="Back to canvas"');
  });

  it("does not render a menu button", () => {
    const html = renderControlBar();
    expect(html).not.toContain('aria-label="Open menu"');
    expect(html).not.toContain('aria-label="Close menu"');
  });

  it("includes extended options addon when hook reports visible", () => {
    const html = renderControlBar({}, { visible: true });
    expect(html).toContain("Chat view");
    expect(html).toContain("Settings");
    expect(html).toContain("Dashboard");
  });

  it("excludes extended options addon when hook reports not visible", () => {
    const html = renderControlBar({}, { visible: false });
    expect(html).not.toContain("Dashboard");
  });

  it("shows extended options and preview as separate addons simultaneously", () => {
    const html = renderControlBar(
      { agentName: "Agent", preview: { text: "Hello from agent", source: "agent" } },
      { visible: true },
    );
    expect(html).toContain("Chat view");
    expect(html).toContain("Dashboard");
    expect(html).toContain("Hello from agent");
    expect(html).toContain('aria-label="Open chat"');
  });

  it("shows backdrop when bar is expanded in canvas mode", () => {
    const html = renderControlBar({
      viewMode: "canvas",
      controlBarCollapsed: false,
    });
    expect(html).toContain('aria-label="Dismiss control bar"');
    expect(html).toContain("opacity-100");
  });

  it("hides backdrop when bar is collapsed", () => {
    const html = renderControlBar({
      viewMode: "canvas",
      controlBarCollapsed: true,
    });
    expect(html).toContain("pointer-events-none opacity-0");
  });

  it("hides backdrop in non-canvas view modes", () => {
    const html = renderControlBar({
      viewMode: "chat",
      controlBarCollapsed: false,
    });
    expect(html).toContain("pointer-events-none opacity-0");
  });

  it("always renders status dot toggle button", () => {
    const html = renderControlBar();
    expect(html).toContain('aria-label="Toggle control bar"');
  });
});
