import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "~/components/ui/tooltip";
import type { BarMode } from "~/features/live-control-bar/hooks/use-control-bar-audio";
import { ControlBar } from "./control-bar";

type MockAudioState = {
  elapsed: number;
  mode: BarMode;
};

const mockAudioHandlers = {
  cancelRecording: vi.fn(),
  pauseRecording: vi.fn(),
  resumeRecording: vi.fn(),
  sendRecording: vi.fn(),
  startRecording: vi.fn(async () => true),
  startVoiceMode: vi.fn(),
  stopVoiceMode: vi.fn(),
};

const mockAudioState: MockAudioState = {
  elapsed: 0,
  mode: "idle",
};

vi.mock("~/features/live-control-bar/hooks/use-control-bar-audio", () => ({
  useControlBarAudio: () => ({
    barsRef: { current: null },
    cancelRecording: mockAudioHandlers.cancelRecording,
    elapsed: mockAudioState.elapsed,
    mode: mockAudioState.mode,
    pauseRecording: mockAudioHandlers.pauseRecording,
    resumeRecording: mockAudioHandlers.resumeRecording,
    sendRecording: mockAudioHandlers.sendRecording,
    startRecording: mockAudioHandlers.startRecording,
    startVoiceMode: mockAudioHandlers.startVoiceMode,
    stopVoiceMode: mockAudioHandlers.stopVoiceMode,
  }),
}));

vi.mock("~/features/live-control-bar/hooks/use-hold-to-record", () => ({
  useHoldToRecord: () => ({
    pointerHandlers: {
      onClick: vi.fn(),
      onContextMenu: vi.fn(),
      onPointerDown: vi.fn(),
    },
  }),
}));

vi.mock("~/hooks/use-long-press", () => ({
  useLongPress: () => ({
    onContextMenuCapture: vi.fn(),
    onPointerCancelCapture: vi.fn(),
    onPointerDownCapture: vi.fn(),
    onPointerMoveCapture: vi.fn(),
    onPointerUpCapture: vi.fn(),
  }),
}));

function renderControlBar(overrides?: {
  agentName?: string | null;
  chatPreview?: string | null;
  viewMode?: "canvas" | "chat" | "settings";
  voiceModeEnabled?: boolean;
}) {
  const model = {
    agentName: overrides?.agentName ?? null,
    chatPreview: overrides?.chatPreview ?? null,
    collapsed: false,
    sendDisabled: false,
    sessionState: undefined,
    viewMode: overrides?.viewMode ?? "canvas",
    visualState: "idle" as const,
    voiceModeEnabled: overrides?.voiceModeEnabled ?? false,
  };

  const transport = {
    bridge: null,
    micGranted: false,
  };

  const actions = {
    onChangeView: vi.fn(),
    onClose: vi.fn(),
    onDismissPreview: vi.fn(),
    onMicGranted: vi.fn(),
    onSendAudio: vi.fn(),
    onSendChat: vi.fn(),
    onTakeover: undefined,
    onToggleCollapsed: vi.fn(),
  };

  return renderToStaticMarkup(
    <TooltipProvider>
      <ControlBar model={model} transport={transport} actions={actions} />
    </TooltipProvider>,
  );
}

describe("ControlBar", () => {
  beforeEach(() => {
    mockAudioState.mode = "idle";
    mockAudioState.elapsed = 0;
    for (const fn of Object.values(mockAudioHandlers)) {
      fn.mockClear();
    }
  });

  it("shows hold-to-record and voice actions in idle mode", () => {
    const html = renderControlBar();
    expect(html).toContain('aria-label="Hold to record audio"');
    expect(html).not.toContain('aria-label="Voice mode"');
    expect(html).not.toContain('aria-label="Send message"');

    const htmlWithVoice = renderControlBar({ voiceModeEnabled: true });
    expect(htmlWithVoice).toContain('aria-label="Voice mode"');
  });

  it("shows recording controls in recording mode", () => {
    mockAudioState.mode = "recording";
    mockAudioState.elapsed = 9;

    const html = renderControlBar();
    expect(html).toContain('aria-label="Delete recording"');
    expect(html).toContain('aria-label="Pause recording"');
    expect(html).toContain('aria-label="Send recording"');
  });

  it("shows stop action in voice mode", () => {
    mockAudioState.mode = "voice-mode";
    const html = renderControlBar();
    expect(html).toContain('aria-label="Stop voice mode"');
  });

  it("shows chat preview when chatPreview is provided", () => {
    const html = renderControlBar({ agentName: "Agent", chatPreview: "Hello from agent" });
    expect(html).toContain("Hello from agent");
    expect(html).toContain("Agent");
    expect(html).toContain("max-h-14 opacity-100");
    expect(html).toContain('aria-label="Open chat"');
  });

  it("hides chat preview when chatPreview is null", () => {
    const html = renderControlBar({ chatPreview: null });
    expect(html).toContain("pointer-events-none max-h-0 opacity-0");
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('aria-label="Open chat"');
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain("min-h-12");
  });

  it("shows back button only outside canvas mode", () => {
    const canvasHtml = renderControlBar({ viewMode: "canvas" });
    expect(canvasHtml).not.toContain('aria-label="Back to canvas"');

    const chatHtml = renderControlBar({ viewMode: "chat" });
    expect(chatHtml).toContain('aria-label="Back to canvas"');
  });
});
