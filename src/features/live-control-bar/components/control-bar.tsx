import { Ellipsis, X } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { Button } from "~/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { useControlBarText } from "~/features/live-control-bar/hooks/use-control-bar-text";
import { useFileUpload } from "~/features/live-control-bar/hooks/use-file-upload";
import { useHoldToRecord } from "~/features/live-control-bar/hooks/use-hold-to-record";
import { useLiveSession } from "~/features/pub/contexts/live-session-context";
import { cn } from "~/lib/utils";
import { CB } from "./control-bar-classes";
import { ControlBarIdleMode } from "./control-bar-idle-mode";
import { ControlBarOfflineMode } from "./control-bar-offline-mode";
import { ControlBarRecordingMode } from "./control-bar-recording-mode";
import { ControlBarShell } from "./control-bar-shell";
import { ControlBarTakeoverMode } from "./control-bar-takeover-mode";
import { ControlBarVoiceMode } from "./control-bar-voice-mode";

const WAVEFORM_BARS = Array.from({ length: 24 }, (_, i) => `bar-${i}`);

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export interface ControlBarProps {
  initialInput?: string;
}

export function ControlBar({ initialInput }: ControlBarProps) {
  const {
    agentName,
    audio,
    bridgeRef,
    connected,
    controlBarCollapsed,
    dismissPreview,
    hasCanvasContent,
    lastTakeoverAt,
    preview,
    setControlBarCollapsed,
    setViewMode,
    sendChat,
    sendFile,
    sessionState,
    takeoverLive,
    uiState,
    viewMode,
    visualState,
    voiceModeEnabled,
    closeLive,
  } = useLiveSession();

  const [expanded, setExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const bridge = bridgeRef.current;

  const { input, setInput, hasText, handleSend, handleKeyDown } = useControlBarText({
    disabled: !connected,
    onSendChat: sendChat,
    initialInput,
  });

  const { fileInputRef, handleFile } = useFileUpload({ bridge, onSendFile: sendFile });

  const closeExpanded = useCallback(() => setExpanded(false), []);

  const handleViewSelect = useCallback(
    (mode: any) => {
      setViewMode(mode);
      setExpanded(false);
    },
    [setViewMode],
  );

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [expanded]);

  useEffect(() => {
    if (audio.mode !== "idle" && expanded) {
      setExpanded(false);
    }
  }, [audio.mode, expanded]);

  const { pointerHandlers } = useHoldToRecord({
    disabled: !connected,
    mode: audio.mode,
    startRecording: audio.startRecording,
    sendRecording: audio.sendRecording,
    cancelRecording: audio.cancelRecording,
  });

  const handlePreviewClick = useCallback(() => {
    setViewMode("chat");
    dismissPreview();
  }, [setViewMode, dismissPreview]);

  const waveformEl = (
    <div ref={audio.barsRef} className="flex h-7 items-center gap-0.5">
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

  if (uiState === "offline") {
    content = <ControlBarOfflineMode onExit={closeLive} />;
  } else if (uiState === "needs-takeover" || uiState === "taken-over") {
    content = (
      <ControlBarTakeoverMode
        lastTakeoverAt={lastTakeoverAt}
        onExit={closeLive}
        onTakeover={takeoverLive}
        sessionState={sessionState as any}
      />
    );
  } else if (uiState === "recording" || uiState === "recording-paused") {
    const isPaused = uiState === "recording-paused";
    content = (
      <ControlBarRecordingMode
        elapsedLabel={formatTime(audio.elapsed)}
        isPaused={isPaused}
        onCancelRecording={audio.cancelRecording}
        onPauseResume={isPaused ? audio.resumeRecording : audio.pauseRecording}
        onSendRecording={audio.sendRecording}
        waveformEl={waveformEl}
      />
    );
  } else if (uiState === "voice-mode") {
    content = (
      <ControlBarVoiceMode
        elapsedLabel={formatTime(audio.elapsed)}
        onStopVoiceMode={audio.stopVoiceMode}
        waveformEl={waveformEl}
      />
    );
  } else {
    content = (
      <ControlBarIdleMode
        agentName={agentName}
        chatPreview={preview?.text ?? null}
        chatPreviewSeverity={preview?.severity ?? null}
        chatPreviewSource={preview?.source ?? null}
        expanded={expanded}
        fileInputRef={fileInputRef}
        hasText={hasText}
        input={input}
        onClose={closeLive}
        onCloseExpanded={closeExpanded}
        onFileChange={handleFile}
        onInputChange={setInput}
        onInputKeyDown={handleKeyDown}
        onPreviewClick={handlePreviewClick}
        onSend={handleSend}
        onStartVoiceMode={audio.startVoiceMode}
        onViewSelect={handleViewSelect}
        onEditingChange={setIsEditing}
        pointerHandlers={pointerHandlers}
        sendDisabled={!connected}
        viewMode={viewMode}
        visualState={visualState}
        voiceModeEnabled={voiceModeEnabled}
      />
    );
  }

  const showMenuButton = uiState === "idle" || uiState === "connecting";

  const menuButton = showMenuButton ? (
    <div
      className={cn(
        "transition-all duration-300 ease-in-out",
        isEditing ? "scale-90 opacity-0 pointer-events-none" : "scale-100 opacity-100",
      )}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="secondary"
            size="controlBack"
            className={CB.backButton}
            onClick={() => setExpanded((prev) => !prev)}
            aria-label={expanded ? "Close menu" : "Open menu"}
          >
            {expanded ? <X className="size-5" /> : <Ellipsis className="size-5" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{expanded ? "Close menu" : "Open menu"}</TooltipContent>
      </Tooltip>
    </div>
  ) : null;

  return (
    <ControlBarShell
      collapsed={controlBarCollapsed}
      hasCanvasContent={hasCanvasContent}
      onToggleCollapsed={() => setControlBarCollapsed((prev: boolean) => !prev)}
      onBackToCanvas={() => setViewMode("canvas")}
      showBackButton={viewMode !== "canvas"}
      visualState={visualState}
      leftAction={menuButton}
    >
      {content}
    </ControlBarShell>
  );
}
