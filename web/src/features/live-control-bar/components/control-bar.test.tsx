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
  bridgeRef: { current: null },
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
  error: { message: null, source: "none" },
  lastTakeoverAt: undefined as number | undefined,
  micGranted: false,
  preview: null,
  retryConnection: vi.fn(),
  setControlBarCollapsed: vi.fn(),
  setSelectedPresenceId: vi.fn(),
  setCanvasError: vi.fn(),
  setMicGranted: vi.fn(),
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

vi.mock("~/features/pub/contexts/live-session-context", () => ({
  useLiveSession: () => mockSession,
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

function renderControlBar(overrides?: RenderOverrides) {
  const { audio, ...sessionOverrides } = overrides ?? {};
  Object.assign(mockSession, sessionOverrides);
  if (audio) Object.assign(mockSession.audio, audio);

  return renderToStaticMarkup(
    <TooltipProvider>
      <ControlBar />
    </TooltipProvider>,
  );
}

describe("ControlBar", () => {
  beforeEach(() => {
    mockSession.controlBarState = "idle";
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

  it("shows chat preview when preview is provided", () => {
    const html = renderControlBar({
      agentName: "Agent",
      preview: { text: "Hello from agent", source: "agent" },
    });
    expect(html).toContain("Hello from agent");
    expect(html).toContain("Agent");
    expect(html).toContain("max-h-60 opacity-100");
    expect(html).toContain('aria-label="Open chat"');
  });

  it("shows back button only outside canvas mode", () => {
    const canvasHtml = renderControlBar({ viewMode: "canvas" });
    expect(canvasHtml).not.toContain('aria-label="Back to canvas"');

    const chatHtml = renderControlBar({ viewMode: "chat" });
    expect(chatHtml).toContain('aria-label="Back to canvas"');
  });
});
