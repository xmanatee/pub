import { ArrowLeft, ChevronDown, ChevronUp } from "lucide-react";
import {
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Button } from "~/components/ui/button";
import { useLongPress } from "~/hooks/use-long-press";
import { CHANNELS, makeBinaryMetaMessage, makeHtmlMessage } from "~/lib/bridge-protocol";
import { cn } from "~/lib/utils";
import type { BrowserBridge } from "~/lib/webrtc-browser";
import { ensureChannelReady } from "~/lib/webrtc-channel";
import { ControlBarIdleMode } from "./control-bar-idle-mode";
import { ControlBarRecordingMode } from "./control-bar-recording-mode";
import { ControlBarVoiceMode } from "./control-bar-voice-mode";
import type { LiveViewMode, LiveVisualState } from "./types";
import { useControlBarAudio } from "./use-control-bar-audio";
import { useHoldToRecord } from "./use-hold-to-record";

const WAVEFORM_BARS = Array.from({ length: 24 }, (_, i) => `bar-${i}`);

interface ControlBarProps {
  chatPreview: string | null;
  collapsed: boolean;
  sendDisabled: boolean;
  bridge: BrowserBridge | null;
  onDismissPreview: () => void;
  onToggleCollapsed: () => void;
  onSendChat: (text: string) => void;
  onSendAudio: (blob: Blob) => void;
  viewMode: LiveViewMode;
  onChangeView: (view: LiveViewMode) => void;
  visualState: LiveVisualState;
  voiceModeEnabled: boolean;
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function ControlBar({
  chatPreview,
  collapsed,
  sendDisabled,
  bridge,
  onDismissPreview,
  onToggleCollapsed,
  onSendChat,
  onSendAudio,
  viewMode,
  onChangeView,
  visualState,
  voiceModeEnabled,
}: ControlBarProps) {
  const [input, setInput] = useState("");
  const [expanded, setExpanded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasText = input.trim().length > 0;

  const floatingShellClass = "pointer-events-none fixed inset-x-0 bottom-0 z-30 px-3 pb-3";
  const floatingShellStyle = { paddingBottom: "calc(var(--safe-bottom) + 0.75rem)" } as const;
  const shellContainerClass = "pointer-events-auto relative mx-auto w-full max-w-4xl";
  const controlHeightClass = "min-h-12";
  const actionButtonClass = "shrink-0";
  const controlBarClass =
    "flex w-full items-center gap-1.5 rounded-full border border-border/70 bg-background/88 px-1.5 shadow-lg backdrop-blur-xl";
  const controlRowClass = "flex w-full items-center gap-1.5 px-1.5";
  const recordingToneClass = "border-destructive/40 bg-background/88";
  const backButtonClass = "border border-border/70 bg-background/88 shadow-lg backdrop-blur-xl";

  const closeExpanded = useCallback(() => setExpanded(false), []);
  const longPressHandlers = useLongPress({ onActivate: () => setExpanded(true) });

  const handleViewSelect = useCallback(
    (mode: LiveViewMode) => {
      onChangeView(mode);
      setExpanded(false);
    },
    [onChangeView],
  );

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [expanded]);

  const {
    barsRef,
    cancelRecording,
    elapsed,
    mode,
    pauseRecording,
    resumeRecording,
    sendRecording,
    startRecording,
    startVoiceMode,
    stopVoiceMode,
  } = useControlBarAudio({ disabled: false, bridge, onSendAudio });

  useEffect(() => {
    if (mode !== "idle" && expanded) {
      setExpanded(false);
    }
  }, [mode, expanded]);

  const { pointerHandlers } = useHoldToRecord({
    disabled: false,
    mode,
    startRecording,
    sendRecording,
    cancelRecording,
  });

  const handlePreviewClick = useCallback(() => {
    onChangeView("chat");
    onDismissPreview();
  }, [onChangeView, onDismissPreview]);

  const handleSend = useCallback(() => {
    if (!hasText) return;
    onSendChat(input.trim());
    setInput("");
  }, [input, hasText, onSendChat]);

  const handleFile = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !bridge) return;
      const isHtml = file.name.endsWith(".html") || file.name.endsWith(".htm");
      if (isHtml) {
        const text = await file.text();
        const ready = await ensureChannelReady(bridge, CHANNELS.CANVAS);
        if (!ready) return;
        bridge.send(CHANNELS.CANVAS, makeHtmlMessage(text, file.name));
      } else {
        const binary = await file.arrayBuffer();
        const ready = await ensureChannelReady(bridge, CHANNELS.FILE);
        if (!ready) return;
        bridge.send(
          CHANNELS.FILE,
          makeBinaryMetaMessage({
            filename: file.name,
            mime: file.type || "application/octet-stream",
            size: binary.byteLength,
          }),
        );
        bridge.sendBinary(CHANNELS.FILE, binary);
      }
      e.target.value = "";
    },
    [bridge],
  );

  const renderFloatingShell = (children: ReactNode) => (
    <div
      className={cn(
        floatingShellClass,
        "transition-transform duration-300",
        collapsed ? "translate-y-full" : null,
      )}
      style={floatingShellStyle}
    >
      <div className={shellContainerClass}>
        <button
          type="button"
          className="pointer-events-auto absolute -top-10 right-0 flex size-8 items-center justify-center rounded-full border border-border/70 bg-background/88 shadow-lg backdrop-blur-xl"
          onClick={onToggleCollapsed}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Show control bar" : "Hide control bar"}
        >
          {collapsed ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </button>
        <div className="flex items-end gap-2" {...(collapsed ? { inert: true } : {})}>
          <div className="min-w-0 flex-1">{children}</div>
          {viewMode !== "canvas" ? (
            <Button
              type="button"
              variant="secondary"
              size="controlBack"
              className={backButtonClass}
              onClick={() => onChangeView("canvas")}
              aria-label="Back to canvas"
            >
              <ArrowLeft />
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );

  const waveformEl = (
    <div ref={barsRef} className="flex h-7 items-center gap-0.5">
      {WAVEFORM_BARS.map((id) => (
        <div
          key={id}
          className="w-1 rounded-full bg-foreground/70 transition-all duration-75"
          style={{ height: "4px" }}
        />
      ))}
    </div>
  );

  if (mode === "recording" || mode === "recording-paused") {
    const isPaused = mode === "recording-paused";
    return renderFloatingShell(
      <ControlBarRecordingMode
        actionButtonClass={actionButtonClass}
        controlBarClass={controlBarClass}
        controlHeightClass={controlHeightClass}
        elapsedLabel={formatTime(elapsed)}
        isPaused={isPaused}
        onCancelRecording={cancelRecording}
        onPauseResume={isPaused ? resumeRecording : pauseRecording}
        onSendRecording={sendRecording}
        recordingToneClass={recordingToneClass}
        waveformEl={waveformEl}
      />,
    );
  }

  if (mode === "voice-mode") {
    return renderFloatingShell(
      <ControlBarVoiceMode
        actionButtonClass={actionButtonClass}
        controlBarClass={controlBarClass}
        controlHeightClass={controlHeightClass}
        elapsedLabel={formatTime(elapsed)}
        onStopVoiceMode={stopVoiceMode}
        recordingToneClass={recordingToneClass}
        waveformEl={waveformEl}
      />,
    );
  }

  return renderFloatingShell(
    <ControlBarIdleMode
      actionButtonClass={actionButtonClass}
      chatPreview={chatPreview}
      controlHeightClass={controlHeightClass}
      controlRowClass={controlRowClass}
      expanded={expanded}
      fileInputRef={fileInputRef}
      hasText={hasText}
      input={input}
      longPressHandlers={longPressHandlers}
      onCloseExpanded={closeExpanded}
      onFileChange={handleFile}
      onInputChange={setInput}
      onPreviewClick={handlePreviewClick}
      onInputKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          handleSend();
        }
      }}
      onSend={handleSend}
      onStartVoiceMode={startVoiceMode}
      onViewSelect={handleViewSelect}
      sendDisabled={sendDisabled}
      voiceModeEnabled={voiceModeEnabled}
      pointerHandlers={pointerHandlers}
      shellContentClassName="border border-border/70 bg-background/86 shadow-lg backdrop-blur-xl transition-all duration-300 rounded-4xl"
      viewMode={viewMode}
      visualState={visualState}
    />,
  );
}
