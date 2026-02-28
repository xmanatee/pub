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
  useRef,
  useState,
} from "react";
import { Button } from "~/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "~/components/ui/context-menu";
import { Input } from "~/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { CHANNELS, makeBinaryMetaMessage, makeHtmlMessage } from "~/lib/bridge-protocol";
import { cn } from "~/lib/utils";
import type { BrowserBridge } from "~/lib/webrtc-browser";
import { ensureChannelReady } from "~/lib/webrtc-channel";
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

function isTunnelViewMode(value: string): value is TunnelViewMode {
  return value === "canvas" || value === "chat" || value === "settings";
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasText = input.trim().length > 0;

  const floatingShellClass =
    "pointer-events-none fixed inset-x-0 bottom-0 z-30 px-3 pb-[calc(var(--safe-bottom)+0.75rem)]";
  const shellContainerClass = "pointer-events-auto mx-auto w-full max-w-4xl";
  const controlBarClass =
    "flex w-full items-center gap-3 rounded-full border border-border/70 bg-background/86 px-4 py-3 shadow-lg backdrop-blur-xl";
  const recordingToneClass = "border-destructive/40 bg-background/88";

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
    <div className={floatingShellClass}>
      <div className={shellContainerClass}>
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">{children}</div>
          {viewMode !== "canvas" ? (
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="h-12 w-12 shrink-0 rounded-full border border-border/70 bg-background/88 shadow-lg backdrop-blur-xl"
              onClick={() => onChangeView("canvas")}
              aria-label="Back to canvas"
            >
              <ArrowLeft className="size-6" />
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
          className="w-1 rounded-full bg-foreground/70 transition-[height] duration-75"
          style={{ height: "4px" }}
        />
      ))}
    </div>
  );

  if (mode === "recording" || mode === "recording-paused") {
    const paused = mode === "recording-paused";
    return renderFloatingShell(
      <div className={cn(controlBarClass, recordingToneClass)}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-11 w-11 shrink-0 rounded-full text-destructive"
              onClick={cancelRecording}
              aria-label="Delete recording"
            >
              <Trash2 className="size-6" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Delete recording</TooltipContent>
        </Tooltip>

        <div className="flex min-w-0 flex-1 items-center gap-3 rounded-full bg-destructive/12 px-3 py-1.5">
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
              className="h-11 w-11 shrink-0 rounded-full"
              onClick={paused ? resumeRecording : pauseRecording}
              aria-label={paused ? "Resume recording" : "Pause recording"}
            >
              {paused ? <Play className="size-6" /> : <Pause className="size-6" />}
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
              className="h-11 w-11 shrink-0 rounded-full"
              onClick={sendRecording}
              aria-label="Send recording"
            >
              <Send className="size-6" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Send recording</TooltipContent>
        </Tooltip>
      </div>,
    );
  }

  if (mode === "voice-mode") {
    return renderFloatingShell(
      <div className={cn(controlBarClass, recordingToneClass)}>
        <div className="flex min-w-0 flex-1 items-center gap-3 rounded-full bg-destructive/12 px-3 py-1.5">
          <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-destructive" />
          <span className="text-sm font-semibold">{formatTime(elapsed)}</span>
          {waveformEl}
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">Voice streaming</span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-11 w-11 shrink-0 rounded-full text-destructive"
          onClick={stopVoiceMode}
          aria-label="Stop voice mode"
        >
          <Square className="size-6" />
        </Button>
      </div>,
    );
  }

  return (
    <ContextMenu modal={false}>
      {renderFloatingShell(
        <ContextMenuTrigger asChild>
          <div>
            <div className={controlBarClass}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11 shrink-0 rounded-full"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={disabled}
                    aria-label="Attach file"
                  >
                    <Paperclip className="size-6" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Attach file</TooltipContent>
              </Tooltip>
              <input ref={fileInputRef} type="file" className="hidden" onChange={handleFile} />

              <Input
                className="h-11 flex-1 border-0 bg-transparent px-1 text-base shadow-none focus-visible:ring-0"
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
              />

              {hasText ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-11 w-11 shrink-0 rounded-full"
                      onClick={handleSend}
                      disabled={disabled}
                      aria-label="Send message"
                    >
                      <Send className="size-6" />
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
                        className="h-11 w-11 shrink-0 rounded-full touch-none"
                        disabled={disabled}
                        aria-label="Record audio"
                        {...pointerHandlers}
                      >
                        <Mic className="size-6" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Record</TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="default"
                        size="icon"
                        className="h-11 w-11 shrink-0 rounded-full"
                        onClick={startVoiceMode}
                        disabled={disabled}
                        aria-label="Voice mode"
                      >
                        <AudioLines className="size-6" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Voice mode</TooltipContent>
                  </Tooltip>
                </>
              )}
            </div>
          </div>
        </ContextMenuTrigger>,
      )}

      <ContextMenuContent>
        <ContextMenuRadioGroup
          value={viewMode}
          onValueChange={(value) => {
            if (isTunnelViewMode(value)) onChangeView(value);
          }}
        >
          <ContextMenuRadioItem value="canvas">Canvas view</ContextMenuRadioItem>
          <ContextMenuRadioItem value="chat">Chat view</ContextMenuRadioItem>
          <ContextMenuRadioItem value="settings">Settings</ContextMenuRadioItem>
        </ContextMenuRadioGroup>
        <ContextMenuSeparator />
        <div className="px-2 py-1 text-xs text-muted-foreground">
          Hold this control bar on mobile to open this menu.
        </div>
      </ContextMenuContent>
    </ContextMenu>
  );
}
