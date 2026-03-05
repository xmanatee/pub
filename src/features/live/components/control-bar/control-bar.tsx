import { type ReactNode, useCallback, useEffect, useState } from "react";
import { useControlBarAudio } from "~/features/live/hooks/use-control-bar-audio";
import { useControlBarText } from "~/features/live/hooks/use-control-bar-text";
import { useFileUpload } from "~/features/live/hooks/use-file-upload";
import { useHoldToRecord } from "~/features/live/hooks/use-hold-to-record";
import type { BrowserBridge } from "~/features/live/lib/webrtc-browser";
import type { LiveViewMode, LiveVisualState, SessionState } from "~/features/live/types/live-types";
import { useLongPress } from "~/hooks/use-long-press";
import { ControlBarIdleMode } from "./control-bar-idle-mode";
import { ControlBarRecordingMode } from "./control-bar-recording-mode";
import { ControlBarShell } from "./control-bar-shell";
import { ControlBarTakeoverMode } from "./control-bar-takeover-mode";
import { ControlBarVoiceMode } from "./control-bar-voice-mode";

const WAVEFORM_BARS = Array.from({ length: 24 }, (_, i) => `bar-${i}`);

export interface ControlBarModel {
  agentName: string | null;
  chatPreview: string | null;
  collapsed: boolean;
  lastTakeoverAt?: number;
  sendDisabled: boolean;
  sessionState?: SessionState;
  viewMode: LiveViewMode;
  visualState: LiveVisualState;
  voiceModeEnabled: boolean;
}

export interface ControlBarTransport {
  bridge: BrowserBridge | null;
  micGranted: boolean;
}

export interface ControlBarActions {
  onChangeView: (view: LiveViewMode) => void;
  onClose: () => void;
  onDismissPreview: () => void;
  onMicGranted: (granted: boolean) => void;
  onSendAudio: (blob: Blob) => void;
  onSendChat: (text: string) => void;
  onTakeover?: () => void;
  onToggleCollapsed: () => void;
}

interface ControlBarProps {
  model: ControlBarModel;
  transport: ControlBarTransport;
  actions: ControlBarActions;
  initialInput?: string;
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function ControlBar({ model, transport, actions, initialInput }: ControlBarProps) {
  const {
    agentName,
    chatPreview,
    collapsed,
    lastTakeoverAt,
    sendDisabled,
    sessionState,
    viewMode,
    visualState,
    voiceModeEnabled,
  } = model;
  const { bridge, micGranted } = transport;
  const {
    onChangeView,
    onClose,
    onDismissPreview,
    onMicGranted,
    onSendAudio,
    onSendChat,
    onTakeover,
    onToggleCollapsed,
  } = actions;
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
