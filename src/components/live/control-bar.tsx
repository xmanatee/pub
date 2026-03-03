import { type ReactNode, useCallback, useEffect, useState } from "react";
import { useLongPress } from "~/hooks/use-long-press";
import type { BrowserBridge } from "~/lib/webrtc-browser";
import { ControlBarIdleMode } from "./control-bar-idle-mode";
import { ControlBarRecordingMode } from "./control-bar-recording-mode";
import { ControlBarShell } from "./control-bar-shell";
import { ControlBarTakeoverMode } from "./control-bar-takeover-mode";
import { ControlBarVoiceMode } from "./control-bar-voice-mode";
import type { LiveViewMode, LiveVisualState, SessionState } from "./types";
import { useControlBarAudio } from "./use-control-bar-audio";
import { useControlBarText } from "./use-control-bar-text";
import { useFileUpload } from "./use-file-upload";
import { useHoldToRecord } from "./use-hold-to-record";

const WAVEFORM_BARS = Array.from({ length: 24 }, (_, i) => `bar-${i}`);

interface ControlBarProps {
  agentName: string | null;
  chatPreview: string | null;
  collapsed: boolean;
  sendDisabled: boolean;
  bridge: BrowserBridge | null;
  lastTakeoverAt?: number;
  onClose: () => void;
  onDismissPreview: () => void;
  onTakeover?: () => void;
  onToggleCollapsed: () => void;
  onSendChat: (text: string) => void;
  onSendAudio: (blob: Blob) => void;
  micGranted: boolean;
  onMicGranted: (granted: boolean) => void;
  sessionState?: SessionState;
  viewMode: LiveViewMode;
  onChangeView: (view: LiveViewMode) => void;
  visualState: LiveVisualState;
  voiceModeEnabled: boolean;
  initialInput?: string;
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function ControlBar({
  agentName,
  chatPreview,
  collapsed,
  sendDisabled,
  bridge,
  lastTakeoverAt,
  onClose,
  onDismissPreview,
  onTakeover,
  onToggleCollapsed,
  onSendChat,
  onSendAudio,
  micGranted,
  onMicGranted,
  sessionState,
  viewMode,
  onChangeView,
  visualState,
  voiceModeEnabled,
  initialInput,
}: ControlBarProps) {
  const [expanded, setExpanded] = useState(false);

  const { input, setInput, hasText, handleSend, handleKeyDown } = useControlBarText({
    onSendChat,
    initialInput,
  });
  const { fileInputRef, handleFile } = useFileUpload({ bridge });

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
  } = useControlBarAudio({ disabled: sendDisabled, bridge, micGranted, onMicGranted, onSendAudio });

  useEffect(() => {
    if (mode !== "idle" && expanded) {
      setExpanded(false);
    }
  }, [mode, expanded]);

  const { pointerHandlers } = useHoldToRecord({
    disabled: sendDisabled,
    mode,
    startRecording,
    sendRecording,
    cancelRecording,
  });

  const handlePreviewClick = useCallback(() => {
    onChangeView("chat");
    onDismissPreview();
  }, [onChangeView, onDismissPreview]);

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

  let content: ReactNode;

  if (sessionState && sessionState !== "active" && onTakeover) {
    content = (
      <ControlBarTakeoverMode
        lastTakeoverAt={lastTakeoverAt}
        onExit={onClose}
        onTakeover={onTakeover}
        sessionState={sessionState}
      />
    );
  } else if (mode === "recording" || mode === "recording-paused") {
    const isPaused = mode === "recording-paused";
    content = (
      <ControlBarRecordingMode
        elapsedLabel={formatTime(elapsed)}
        isPaused={isPaused}
        onCancelRecording={cancelRecording}
        onPauseResume={isPaused ? resumeRecording : pauseRecording}
        onSendRecording={sendRecording}
        waveformEl={waveformEl}
      />
    );
  } else if (mode === "voice-mode") {
    content = (
      <ControlBarVoiceMode
        elapsedLabel={formatTime(elapsed)}
        onStopVoiceMode={stopVoiceMode}
        waveformEl={waveformEl}
      />
    );
  } else {
    content = (
      <ControlBarIdleMode
        agentName={agentName}
        chatPreview={chatPreview}
        expanded={expanded}
        fileInputRef={fileInputRef}
        hasText={hasText}
        input={input}
        longPressHandlers={longPressHandlers}
        onClose={onClose}
        onCloseExpanded={closeExpanded}
        onFileChange={handleFile}
        onInputChange={setInput}
        onInputKeyDown={handleKeyDown}
        onPreviewClick={handlePreviewClick}
        onSend={handleSend}
        onStartVoiceMode={startVoiceMode}
        onViewSelect={handleViewSelect}
        pointerHandlers={pointerHandlers}
        sendDisabled={sendDisabled}
        viewMode={viewMode}
        visualState={visualState}
        voiceModeEnabled={voiceModeEnabled}
      />
    );
  }

  return (
    <ControlBarShell
      collapsed={collapsed}
      onToggleCollapsed={onToggleCollapsed}
      onBackToCanvas={() => onChangeView("canvas")}
      showBackButton={viewMode !== "canvas"}
    >
      {content}
    </ControlBarShell>
  );
}
