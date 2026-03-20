import { ArrowLeft } from "lucide-react";
import { type ReactNode, useCallback, useEffect } from "react";
import { Button } from "~/components/ui/button";
import { BlobVisual } from "~/features/live/components/visuals/blob-visual";
import { VISUAL_THEME } from "~/features/live/components/visuals/shared";
import type { LiveViewMode } from "~/features/live/types/live-types";
import { useControlBarText } from "~/features/live-control-bar/hooks/use-control-bar-text";
import { useExtendedOptionsVisibility } from "~/features/live-control-bar/hooks/use-extended-options-visibility";
import { useFileUpload } from "~/features/live-control-bar/hooks/use-file-upload";
import { useLiveSession } from "~/features/pub/contexts/live-session-context";
import { cn } from "~/lib/utils";
import { ControlBarPrimitive } from "../architecture/control-bar-primitive";
import type { ControlBarAddon } from "../architecture/control-bar-types";
import { ControlBarAgentSelectionMode } from "./control-bar-agent-selection-mode";
import { ControlBarBusyMode } from "./control-bar-busy-mode";
import { CB } from "./control-bar-classes";
import { ControlBarDisconnectedMode } from "./control-bar-disconnected-mode";
import { ControlBarInputRow } from "./control-bar-input-row";
import { ControlBarOfflineMode } from "./control-bar-offline-mode";
import { ControlBarRecordingMode } from "./control-bar-recording-mode";
import { ControlBarTakeoverMode } from "./control-bar-takeover-mode";
import { controlBarStyleFromTone } from "./control-bar-theme";
import { ControlBarVoiceMode } from "./control-bar-voice-mode";
import { ExtendedOptions } from "./extended-options";

const WAVEFORM_BARS = Array.from({ length: 24 }, (_, i) => `bar-${i}`);

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

interface ControlBarProps {
  initialInput?: string;
}

export function ControlBar({ initialInput }: ControlBarProps) {
  const {
    agentName,
    audio,
    availableAgents,
    collapseControlBar,
    connected,
    controlBarCollapsed,
    controlBarState,
    dismissPreview,
    lastTakeoverAt,
    preview,
    retryConnection,
    toggleControlBar,
    setSelectedPresenceId,
    setViewMode,
    sendChat,
    sendFile,
    takeoverLive,
    viewMode,
    visualState,
    voiceModeEnabled,
    closeLive,
  } = useLiveSession();

  const isBarExpanded = viewMode === "canvas" ? !controlBarCollapsed : true;

  const { visible: extendedOptionsVisible, dismiss: dismissExtendedOptions } =
    useExtendedOptionsVisibility({ controlBarState, isBarExpanded, viewMode });

  const { input, setInput, hasText, handleSend, handleKeyDown } = useControlBarText({
    disabled: !connected,
    onSendChat: sendChat,
    initialInput,
  });

  const { fileInputRef, handleFile } = useFileUpload({ onSendFile: sendFile });

  const handleViewSelect = useCallback(
    (mode: LiveViewMode) => {
      setViewMode(mode);
      dismissExtendedOptions();
    },
    [setViewMode, dismissExtendedOptions],
  );

  useEffect(() => {
    if (!isBarExpanded) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") toggleControlBar();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isBarExpanded, toggleControlBar]);

  const handlePreviewClick = useCallback(() => {
    setViewMode("chat");
    dismissPreview();
  }, [dismissPreview, setViewMode]);

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

  let centerContent: ReactNode;
  if (controlBarState === "agent-selection") {
    centerContent = (
      <ControlBarAgentSelectionMode
        agents={availableAgents}
        onExit={closeLive}
        onSelect={setSelectedPresenceId}
      />
    );
  } else if (controlBarState === "offline") {
    centerContent = <ControlBarOfflineMode onExit={closeLive} />;
  } else if (controlBarState === "disconnected") {
    centerContent = <ControlBarDisconnectedMode onExit={closeLive} onReconnect={retryConnection} />;
  } else if (controlBarState === "needs-takeover" || controlBarState === "taken-over") {
    centerContent = (
      <ControlBarTakeoverMode
        lastTakeoverAt={lastTakeoverAt}
        onExit={closeLive}
        onTakeover={takeoverLive}
        sessionState={controlBarState}
      />
    );
  } else if (controlBarState === "starting-recording") {
    centerContent = <ControlBarBusyMode label="Starting recording..." />;
  } else if (controlBarState === "stopping-recording") {
    centerContent = <ControlBarBusyMode label="Finishing recording..." />;
  } else if (controlBarState === "recording" || controlBarState === "recording-paused") {
    centerContent = (
      <ControlBarRecordingMode
        elapsedLabel={formatTime(audio.elapsed)}
        isPaused={controlBarState === "recording-paused"}
        onCancelRecording={audio.cancelRecording}
        onPauseResume={
          controlBarState === "recording-paused" ? audio.resumeRecording : audio.pauseRecording
        }
        onSendRecording={audio.sendRecording}
        waveformEl={waveformEl}
      />
    );
  } else if (controlBarState === "starting-voice") {
    centerContent = <ControlBarBusyMode label="Starting voice mode..." />;
  } else if (controlBarState === "stopping-voice") {
    centerContent = <ControlBarBusyMode label="Stopping voice mode..." />;
  } else if (controlBarState === "voice-mode") {
    centerContent = (
      <ControlBarVoiceMode
        elapsedLabel={formatTime(audio.elapsed)}
        onStopVoiceMode={audio.stopVoiceMode}
        waveformEl={waveformEl}
      />
    );
  } else {
    centerContent = (
      <ControlBarInputRow
        fileInputRef={fileInputRef}
        hasText={hasText}
        input={input}
        onFileChange={handleFile}
        onFocus={dismissExtendedOptions}
        onInputChange={setInput}
        onInputKeyDown={handleKeyDown}
        onSend={handleSend}
        onStartRecording={audio.startRecording}
        onStartVoiceMode={audio.startVoiceMode}
        sendDisabled={!connected}
        visualState={visualState}
        voiceModeEnabled={voiceModeEnabled}
      />
    );
  }

  const addons: ControlBarAddon[] = [];

  if (extendedOptionsVisible) {
    addons.push({
      key: "extended-options",
      priority: 0,
      content: (
        <ExtendedOptions viewMode={viewMode} onClose={closeLive} onSelect={handleViewSelect} />
      ),
    });
  }

  if (preview) {
    const previewLabel = preview.source === "system" ? "System" : (agentName ?? "Agent");
    const previewLabelClass =
      preview.source === "system"
        ? preview.severity === "error"
          ? "text-destructive"
          : "text-amber-600"
        : "text-primary";

    addons.push({
      key: "preview",
      priority: 1,
      content: (
        <button
          type="button"
          className="w-full overflow-hidden text-left"
          onClick={handlePreviewClick}
          aria-label="Open chat"
        >
          <div className="truncate px-4 py-2.5 text-sm leading-tight">
            <span className={cn("font-semibold", previewLabelClass)}>{previewLabel}</span>
            <span className="text-muted-foreground">: </span>
            <span className="text-foreground">{preview.text}</span>
          </div>
        </button>
      ),
    });
  }

  const rightAction =
    viewMode !== "canvas" ? (
      <Button
        type="button"
        variant="secondary"
        size="controlBack"
        className={CB.backButton}
        onClick={() => {
          setViewMode("canvas");
          collapseControlBar();
        }}
        aria-label="Back to canvas"
      >
        <ArrowLeft />
      </Button>
    ) : null;

  const showBackdrop = isBarExpanded && viewMode === "canvas";

  const statusAction = <BlobVisual tone={VISUAL_THEME[visualState]} />;
  const shellStyle = controlBarStyleFromTone(VISUAL_THEME[visualState], visualState);

  return (
    <>
      <button
        type="button"
        className={cn(
          "fixed inset-0 z-10 bg-black/20 transition-opacity duration-300",
          showBackdrop ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={toggleControlBar}
        aria-label="Dismiss control bar"
      />

      <ControlBarPrimitive
        centerContent={centerContent}
        rightAction={rightAction}
        addons={addons}
        statusAction={statusAction}
        isExpanded={isBarExpanded}
        onStatusClick={toggleControlBar}
        className={
          controlBarState === "recording" || controlBarState === "recording-paused"
            ? CB.recordingTone
            : ""
        }
        shellStyle={shellStyle as React.CSSProperties}
      />
    </>
  );
}
