import {
  ArrowLeft,
  AudioLines,
  Mic,
  Paperclip,
  Pause,
  Play,
  Send,
  Square,
  Trash2,
} from "lucide-react";
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
import { Input } from "~/components/ui/input";
import { Separator } from "~/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { useLongPress } from "~/hooks/use-long-press";
import { CHANNELS, makeBinaryMetaMessage, makeHtmlMessage } from "~/lib/bridge-protocol";
import { cn } from "~/lib/utils";
import type { BrowserBridge } from "~/lib/webrtc-browser";
import { ensureChannelReady } from "~/lib/webrtc-channel";
import { ExtendedOptions } from "./extended-options";
import type { TunnelViewMode } from "./types";
import { useControlBarAudio } from "./use-control-bar-audio";
import { useHoldToRecord } from "./use-hold-to-record";

const WAVEFORM_BARS = Array.from({ length: 24 }, (_, i) => `bar-${i}`);

interface ControlBarProps {
  disabled: boolean;
  bridge: BrowserBridge | null;
  onSendChat: (text: string) => void;
  onSendAudio: (blob: Blob) => void;
  viewMode: TunnelViewMode;
  onChangeView: (view: TunnelViewMode) => void;
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function ControlBar({
  disabled,
  bridge,
  onSendChat,
  onSendAudio,
  viewMode,
  onChangeView,
}: ControlBarProps) {
  const [input, setInput] = useState("");
  const [expanded, setExpanded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasText = input.trim().length > 0;

  const floatingShellClass = "pointer-events-none fixed inset-x-0 bottom-0 z-30 px-3 pb-3";
  const floatingShellStyle = { paddingBottom: "calc(var(--safe-bottom) + 0.75rem)" } as const;
  const shellContainerClass = "pointer-events-auto mx-auto w-full max-w-4xl";
  const controlHeightClass = "h-16 min-h-16";
  const actionButtonClass = "size-14 shrink-0 rounded-full";
  const actionIconClass = "size-10";
  const controlBarClass =
    "flex w-full items-center gap-2 rounded-full border border-border/70 bg-background/88 px-2 shadow-lg backdrop-blur-xl";
  const controlRowClass = "flex w-full items-center gap-2 px-2";
  const recordingToneClass = "border-destructive/40 bg-background/88";
  const backButtonClass =
    "h-16 w-16 shrink-0 rounded-full border border-border/70 bg-background/88 shadow-lg backdrop-blur-xl";

  const closeExpanded = useCallback(() => setExpanded(false), []);
  const longPressHandlers = useLongPress({ onActivate: () => setExpanded(true) });

  const handleViewSelect = useCallback(
    (mode: TunnelViewMode) => {
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
  } = useControlBarAudio({ disabled, bridge, onSendAudio });

  useEffect(() => {
    if (mode !== "idle" && expanded) {
      setExpanded(false);
    }
  }, [mode, expanded]);

  const { pointerHandlers } = useHoldToRecord({
    disabled,
    mode,
    startRecording,
    sendRecording,
    cancelRecording,
  });

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
    <div className={floatingShellClass} style={floatingShellStyle}>
      <div className={shellContainerClass}>
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">{children}</div>
          {viewMode !== "canvas" ? (
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className={backButtonClass}
              onClick={() => onChangeView("canvas")}
              aria-label="Back to canvas"
            >
              <ArrowLeft className={actionIconClass} />
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );

  const waveformEl = (
    <div ref={barsRef} className="flex h-9 items-center gap-0.5">
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
    const paused = mode === "recording-paused";
    return renderFloatingShell(
      <div className={cn(controlBarClass, controlHeightClass, recordingToneClass)}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(actionButtonClass, "text-destructive")}
              onClick={cancelRecording}
              aria-label="Delete recording"
            >
              <Trash2 className={actionIconClass} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Delete recording</TooltipContent>
        </Tooltip>

        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full bg-destructive/12 px-3 py-2">
          <div
            className={cn(
              "h-2.5 w-2.5 rounded-full",
              paused ? "bg-muted-foreground" : "animate-pulse bg-destructive",
            )}
          />
          <span className="text-sm font-semibold">{formatTime(elapsed)}</span>
          <div className={cn("min-w-0 flex-1", paused ? "opacity-45" : "opacity-100")}>
            {waveformEl}
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">
            {paused ? "Paused" : "Recording"}
          </span>
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={actionButtonClass}
              onClick={paused ? resumeRecording : pauseRecording}
              aria-label={paused ? "Resume recording" : "Pause recording"}
            >
              {paused ? (
                <Play className={actionIconClass} />
              ) : (
                <Pause className={actionIconClass} />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{paused ? "Resume" : "Pause"}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="default"
              size="icon"
              className={actionButtonClass}
              onClick={sendRecording}
              aria-label="Send recording"
            >
              <Send className={actionIconClass} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Send recording</TooltipContent>
        </Tooltip>
      </div>,
    );
  }

  if (mode === "voice-mode") {
    return renderFloatingShell(
      <div className={cn(controlBarClass, controlHeightClass, recordingToneClass)}>
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full bg-destructive/12 px-3 py-2">
          <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-destructive" />
          <span className="text-sm font-semibold">{formatTime(elapsed)}</span>
          {waveformEl}
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">Voice streaming</span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(actionButtonClass, "text-destructive")}
          onClick={stopVoiceMode}
          aria-label="Stop voice mode"
        >
          <Square className={actionIconClass} />
        </Button>
      </div>,
    );
  }

  return (
    <>
      <button
        type="button"
        className={cn(
          "fixed inset-0 z-20 bg-black/20 transition-opacity duration-300",
          expanded ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={closeExpanded}
        aria-label="Close control bar menu"
        disabled={!expanded}
        tabIndex={expanded ? 0 : -1}
      />

      {renderFloatingShell(
        <div
          className={cn(
            "border border-border/70 bg-background/86 shadow-lg backdrop-blur-xl transition-all duration-300",
            expanded ? "rounded-3xl" : "rounded-full",
          )}
          {...longPressHandlers}
        >
          <div
            className={cn(
              "overflow-hidden transition-all duration-300",
              expanded ? "max-h-36 opacity-100" : "max-h-0 opacity-0",
            )}
          >
            <ExtendedOptions viewMode={viewMode} onSelect={handleViewSelect} />
            <Separator />
          </div>

          <div className={cn(controlRowClass, controlHeightClass)}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={actionButtonClass}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={disabled}
                  aria-label="Attach file"
                >
                  <Paperclip className={actionIconClass} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Attach file</TooltipContent>
            </Tooltip>
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleFile} />

            <Input
              placeholder={disabled ? "Connecting..." : "Message..."}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              disabled={disabled}
              aria-label="Message"
              autoCapitalize="sentences"
              autoCorrect="on"
              spellCheck
              enterKeyHint="send"
              className="h-14 flex-1 border-0 bg-transparent px-2 text-base shadow-none focus-visible:ring-0"
            />

            {hasText ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="default"
                    size="icon"
                    className={actionButtonClass}
                    onClick={handleSend}
                    disabled={disabled}
                    aria-label="Send message"
                  >
                    <Send className={actionIconClass} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Send</TooltipContent>
              </Tooltip>
            ) : (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn(actionButtonClass, "touch-none long-press-ignore")}
                      disabled={disabled}
                      aria-label="Hold to record audio"
                      {...pointerHandlers}
                    >
                      <Mic className={actionIconClass} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Hold to record</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="default"
                      size="icon"
                      className={actionButtonClass}
                      onClick={startVoiceMode}
                      disabled={disabled}
                      aria-label="Voice mode"
                    >
                      <AudioLines className={actionIconClass} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Voice mode</TooltipContent>
                </Tooltip>
              </>
            )}
          </div>
        </div>,
      )}
    </>
  );
}
