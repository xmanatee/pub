import { AudioLines, Lock, Mic, Paperclip, Send, Square } from "lucide-react";
import { type ChangeEvent, type KeyboardEvent, useCallback, useRef, useState } from "react";
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
import type { BrowserBridge } from "~/lib/webrtc-browser";
import { ensureChannelReady } from "~/lib/webrtc-channel";
import type { TunnelViewMode } from "./types";
import { useControlBarAudio } from "./use-control-bar-audio";

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

  const {
    barsRef,
    elapsed,
    handleMicPointerCancel,
    handleMicPointerDown,
    handleMicPointerMove,
    handleMicPointerUp,
    lockHint,
    mode,
    startVoiceMode,
    stopLockedRecording,
    stopVoiceMode,
  } = useControlBarAudio({ disabled, bridge, onSendAudio });

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

  const waveformEl = (
    <div ref={barsRef} className="flex items-center gap-0.5 h-9">
      {WAVEFORM_BARS.map((id) => (
        <div
          key={id}
          className="w-1 rounded-full bg-white/80 transition-[height] duration-75"
          style={{ height: "4px" }}
        />
      ))}
    </div>
  );

  if (mode === "push-recording") {
    return (
      <div className={floatingShellClass}>
        <div className="pointer-events-auto mx-auto w-full max-w-4xl relative">
          <div
            className="absolute -top-14 left-1/2 -translate-x-1/2 flex items-center justify-center transition-opacity duration-150"
            style={{ opacity: Math.max(0.2, lockHint) }}
          >
            <div className="bg-zinc-800/90 border border-white/15 rounded-full p-2 backdrop-blur-md shadow-lg">
              <Lock className="h-5 w-5 text-white" />
            </div>
          </div>
          <div className="flex w-full items-center justify-center gap-3 rounded-[1.6rem] border border-red-400/45 bg-red-600/92 px-5 py-4 shadow-xl backdrop-blur-xl">
            <div className="h-2.5 w-2.5 rounded-full bg-white animate-pulse" />
            <span className="text-white text-sm font-semibold">{formatTime(elapsed)}</span>
            {waveformEl}
          </div>
        </div>
      </div>
    );
  }

  if (mode === "locked-recording" || mode === "voice-mode") {
    const onStop = mode === "voice-mode" ? stopVoiceMode : stopLockedRecording;
    return (
      <div className={floatingShellClass}>
        <div className="pointer-events-auto mx-auto w-full max-w-4xl">
          <Button
            type="button"
            variant="destructive"
            onClick={onStop}
            className="flex w-full items-center justify-center gap-3 rounded-[1.6rem] border border-red-400/45 bg-red-600/92 px-5 py-4 cursor-pointer shadow-xl backdrop-blur-xl"
          >
            <div className="h-2.5 w-2.5 rounded-full bg-white animate-pulse" />
            <span className="text-white text-sm font-semibold">{formatTime(elapsed)}</span>
            {waveformEl}
            <Square className="ml-3 h-4 w-4 text-white shrink-0" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className={floatingShellClass}>
          <div className="pointer-events-auto mx-auto w-full max-w-4xl">
            <div className="flex items-center gap-3 rounded-[1.6rem] border border-border/70 bg-background/86 px-4 py-3 shadow-lg backdrop-blur-xl">
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
                    <Paperclip className="h-5 w-5" />
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
                      <Send className="h-5 w-5" />
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
                        onPointerDown={handleMicPointerDown}
                        onPointerMove={handleMicPointerMove}
                        onPointerUp={handleMicPointerUp}
                        onPointerCancel={handleMicPointerCancel}
                        disabled={disabled}
                        aria-label="Push to talk"
                      >
                        <Mic className="h-5 w-5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Hold to talk</TooltipContent>
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
                        <AudioLines className="h-5 w-5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Voice mode</TooltipContent>
                  </Tooltip>
                </>
              )}
            </div>
          </div>
        </div>
      </ContextMenuTrigger>

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
