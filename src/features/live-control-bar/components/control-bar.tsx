import { ArrowLeft, Ellipsis, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "~/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { BlobVisual } from "~/features/live/components/visuals/blob-visual";
import { VISUAL_THEME } from "~/features/live/components/visuals/shared";
import { useControlBarText } from "~/features/live-control-bar/hooks/use-control-bar-text";
import { useFileUpload } from "~/features/live-control-bar/hooks/use-file-upload";
import { useHoldToRecord } from "~/features/live-control-bar/hooks/use-hold-to-record";
import { useLiveSession } from "~/features/pub/contexts/live-session-context";
import { cn } from "~/lib/utils";
import { ControlBarPrimitive } from "../architecture/control-bar-primitive";
import { CB } from "./control-bar-classes";
import { ControlBarInputRow } from "./control-bar-input-row";
import { ControlBarOfflineMode } from "./control-bar-offline-mode";
import { ControlBarRecordingMode } from "./control-bar-recording-mode";
import { ControlBarTakeoverMode } from "./control-bar-takeover-mode";
import { ControlBarVoiceMode } from "./control-bar-voice-mode";
import { ExtendedOptions } from "./extended-options";

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
    canvasHtml,
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

  const hasContent = Boolean(canvasHtml);
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

  const centerContent = useMemo(() => {
    if (uiState === "offline") return <ControlBarOfflineMode onExit={closeLive} />;
    if (uiState === "needs-takeover" || uiState === "taken-over") {
      return (
        <ControlBarTakeoverMode
          lastTakeoverAt={lastTakeoverAt}
          onExit={closeLive}
          onTakeover={takeoverLive}
          sessionState={sessionState as any}
        />
      );
    }
    if (uiState === "recording" || uiState === "recording-paused") {
      const isPaused = uiState === "recording-paused";
      return (
        <ControlBarRecordingMode
          elapsedLabel={formatTime(audio.elapsed)}
          isPaused={isPaused}
          onCancelRecording={audio.cancelRecording}
          onPauseResume={isPaused ? audio.resumeRecording : audio.pauseRecording}
          onSendRecording={audio.sendRecording}
          waveformEl={waveformEl}
        />
      );
    }
    if (uiState === "voice-mode") {
      return (
        <ControlBarVoiceMode
          elapsedLabel={formatTime(audio.elapsed)}
          onStopVoiceMode={audio.stopVoiceMode}
          waveformEl={waveformEl}
        />
      );
    }
    return (
      <ControlBarInputRow
        fileInputRef={fileInputRef}
        hasText={hasText}
        input={input}
        onFileChange={handleFile}
        onInputChange={setInput}
        onInputKeyDown={handleKeyDown}
        onSend={handleSend}
        onStartVoiceMode={audio.startVoiceMode}
        onEditingChange={setIsEditing}
        pointerHandlers={pointerHandlers}
        sendDisabled={!connected}
        visualState={visualState}
        voiceModeEnabled={voiceModeEnabled}
      />
    );
  }, [
    uiState,
    visualState,
    input,
    hasText,
    connected,
    voiceModeEnabled,
    audio.elapsed,
    lastTakeoverAt,
    sessionState,
    closeLive,
    takeoverLive,
    fileInputRef,
    handleFile,
    setInput,
    handleKeyDown,
    handleSend,
    audio.startVoiceMode,
    pointerHandlers,
    audio.cancelRecording,
    audio.pauseRecording,
    audio.resumeRecording,
    audio.sendRecording,
    audio.stopVoiceMode,
    waveformEl,
  ]);

  const leftAction =
    viewMode === "canvas" && (uiState === "idle" || uiState === "connecting") ? (
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
    ) : null;

  const rightAction =
    viewMode !== "canvas" ? (
      <Button
        type="button"
        variant="secondary"
        size="controlBack"
        className={CB.backButton}
        onClick={() => setViewMode("canvas")}
        aria-label="Back to canvas"
      >
        <ArrowLeft />
      </Button>
    ) : null;

  const topAddon = useMemo(() => {
    if (expanded) {
      return (
        <div
          className={cn(
            CB.shellContent,
            "border border-border/70 bg-background/86 shadow-lg backdrop-blur-xl rounded-4xl",
          )}
        >
          <ExtendedOptions viewMode={viewMode} onClose={closeLive} onSelect={handleViewSelect} />
        </div>
      );
    }
    if (preview && !isEditing) {
      const previewLabel = preview.source === "system" ? "System" : (agentName ?? "Agent");
      const previewLabelClass =
        preview.source === "system"
          ? preview.severity === "error"
            ? "text-destructive"
            : "text-amber-600"
          : "text-primary";

      return (
        <button
          type="button"
          className={cn(
            "w-full overflow-hidden text-left border border-border/70 bg-background/86 shadow-lg backdrop-blur-xl transition-all duration-300 rounded-4xl",
          )}
          onClick={handlePreviewClick}
          aria-label="Open chat"
        >
          <div className="truncate px-4 py-2.5 text-sm leading-tight">
            <span className={cn("font-semibold", previewLabelClass)}>{previewLabel}</span>
            <span className="text-muted-foreground">: </span>
            <span className="text-foreground">{preview.text}</span>
          </div>
        </button>
      );
    }
    return null;
  }, [
    expanded,
    preview,
    isEditing,
    viewMode,
    agentName,
    closeLive,
    handleViewSelect,
    handlePreviewClick,
  ]);

  const statusAction =
    hasContent && (uiState === "idle" || uiState === "connecting") ? (
      <BlobVisual tone={VISUAL_THEME[visualState]} hasCanvasContent={false} />
    ) : null;

  return (
    <>
      <button
        type="button"
        className={cn(
          "fixed inset-0 z-10 bg-black/20 transition-opacity duration-300",
          expanded ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={closeExpanded}
        aria-label="Close control bar menu"
      />

      <ControlBarPrimitive
        leftAction={leftAction}
        centerContent={centerContent}
        rightAction={rightAction}
        topAddon={topAddon}
        statusAction={statusAction}
        isExpanded={viewMode === "canvas" ? !controlBarCollapsed : true}
        onStatusClick={() => setControlBarCollapsed((prev: boolean) => !prev)}
        className={uiState === "recording" ? CB.recordingTone : ""}
        isInteracting={isEditing}
      />
    </>
  );
}
