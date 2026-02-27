import { AudioLines, Lock, Mic, Paperclip, Send, Square } from "lucide-react";
import {
  type ChangeEvent,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Button } from "~/components/ui/button";
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuTrigger,
} from "~/components/ui/context-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import {
  CHANNELS,
  makeBinaryMetaMessage,
  makeHtmlMessage,
  makeStreamEnd,
  makeStreamStart,
} from "~/lib/bridge-protocol";
import type { BrowserBridge } from "~/lib/webrtc-browser";

const WAVEFORM_BARS = Array.from({ length: 24 }, (_, i) => `bar-${i}`);
const LOCK_DRAG_THRESHOLD = 40;

type BarMode = "idle" | "push-recording" | "locked-recording" | "voice-mode";

interface MessageBarProps {
  disabled: boolean;
  bridge: BrowserBridge | null;
  onSendChat: (text: string) => void;
  onSendAudio: (blob: Blob) => void;
  canvasMode: boolean;
  onToggleView: () => void;
}

export function MessageBar({
  disabled,
  bridge,
  onSendChat,
  onSendAudio,
  canvasMode,
  onToggleView,
}: MessageBarProps) {
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<BarMode>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [lockHint, setLockHint] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number>(0);
  const barsRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const initialYRef = useRef(0);
  const lockedRef = useRef(false);
  const streamIdRef = useRef<string | null>(null);

  const hasText = input.trim().length > 0;

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
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [bridge],
  );

  const animateWaveform = useCallback(() => {
    const analyser = analyserRef.current;
    const container = barsRef.current;
    if (!analyser || !container) return;
    const data = new Uint8Array(analyser.frequencyBinCount);

    function draw() {
      if (!analyser || !container) return;
      analyser.getByteFrequencyData(data);
      const bars = container.children;
      for (let i = 0; i < bars.length; i++) {
        const value = data[i % data.length] / 255;
        const height = Math.max(4, value * 32);
        (bars[i] as HTMLElement).style.height = `${height}px`;
      }
      animFrameRef.current = requestAnimationFrame(draw);
    }
    draw();
  }, []);

  const startTimer = useCallback(() => {
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed((t) => t + 1), 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const cleanup = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) track.stop();
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
    cancelAnimationFrame(animFrameRef.current);
    analyserRef.current = null;
    stopTimer();
  }, [stopTimer]);

  const setupAudio = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    const audioCtx = new AudioContext();
    audioCtxRef.current = audioCtx;
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 64;
    source.connect(analyser);
    analyserRef.current = analyser;
    return { stream, audioCtx };
  }, []);

  // -- Push-to-talk: pointer down on mic button --
  const handleMicPointerDown = useCallback(
    async (e: ReactPointerEvent<HTMLButtonElement>) => {
      if (disabled || mode !== "idle") return;
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      initialYRef.current = e.clientY;
      lockedRef.current = false;
      setLockHint(0);

      try {
        const { stream } = await setupAudio();
        const recorder = new MediaRecorder(stream, { mimeType: getSupportedMimeType() });
        audioChunksRef.current = [];
        recorder.ondataavailable = (ev) => {
          if (ev.data.size > 0) audioChunksRef.current.push(ev.data);
        };
        recorder.onstop = () => {
          const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType });
          if (blob.size > 0) onSendAudio(blob);
        };
        mediaRecorderRef.current = recorder;
        recorder.start();
        setMode("push-recording");
        startTimer();
        animateWaveform();
      } catch {
        // Mic access denied
      }
    },
    [disabled, mode, setupAudio, onSendAudio, startTimer, animateWaveform],
  );

  const handleMicPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>) => {
      if (mode !== "push-recording") return;
      const dy = initialYRef.current - e.clientY;
      setLockHint(Math.min(dy / LOCK_DRAG_THRESHOLD, 1));
      if (dy > LOCK_DRAG_THRESHOLD) {
        lockedRef.current = true;
      }
    },
    [mode],
  );

  const handleMicPointerUp = useCallback(() => {
    if (mode !== "push-recording") return;
    setLockHint(0);
    if (lockedRef.current) {
      setMode("locked-recording");
    } else {
      // Stop and send
      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.stop();
      }
      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) track.stop();
        streamRef.current = null;
      }
      if (audioCtxRef.current) {
        audioCtxRef.current.close();
        audioCtxRef.current = null;
      }
      cancelAnimationFrame(animFrameRef.current);
      analyserRef.current = null;
      stopTimer();
      setMode("idle");
    }
  }, [mode, stopTimer]);

  // -- Locked recording: click to stop & send --
  const handleLockedStop = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) track.stop();
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
    cancelAnimationFrame(animFrameRef.current);
    analyserRef.current = null;
    stopTimer();
    setMode("idle");
  }, [stopTimer]);

  // -- Voice mode: continuous streaming --
  const startVoiceMode = useCallback(async () => {
    if (disabled || !bridge) return;
    try {
      const { stream } = await setupAudio();
      const mime = getSupportedMimeType();

      const ready = await ensureChannelReady(bridge, CHANNELS.AUDIO);
      if (!ready) {
        cleanup();
        return;
      }

      const startMsg = makeStreamStart({ mime });
      bridge.send(CHANNELS.AUDIO, startMsg);
      streamIdRef.current = startMsg.id;

      const recorder = new MediaRecorder(stream, { mimeType: mime });
      recorder.ondataavailable = async (ev) => {
        if (ev.data.size > 0 && bridge && streamIdRef.current) {
          const buf = await ev.data.arrayBuffer();
          bridge.sendBinary(CHANNELS.AUDIO, buf);
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start(2000);
      setMode("voice-mode");
      startTimer();
      animateWaveform();
    } catch {
      cleanup();
    }
  }, [disabled, bridge, setupAudio, cleanup, startTimer, animateWaveform]);

  const stopVoiceMode = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    if (bridge && streamIdRef.current) {
      bridge.send(CHANNELS.AUDIO, makeStreamEnd(streamIdRef.current));
      streamIdRef.current = null;
    }
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) track.stop();
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
    cancelAnimationFrame(animFrameRef.current);
    analyserRef.current = null;
    stopTimer();
    setMode("idle");
  }, [bridge, stopTimer]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(animFrameRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) track.stop();
      }
    };
  }, []);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const waveformEl = (
    <div ref={barsRef} className="flex items-center gap-0.5 h-8">
      {WAVEFORM_BARS.map((id) => (
        <div
          key={id}
          className="w-1 rounded-full bg-white/80 transition-[height] duration-75"
          style={{ height: "4px" }}
        />
      ))}
    </div>
  );

  // -- Push-recording overlay --
  if (mode === "push-recording") {
    return (
      <div className="shrink-0 safe-bottom relative">
        <div
          className="absolute -top-12 left-1/2 -translate-x-1/2 flex items-center justify-center transition-opacity duration-150"
          style={{ opacity: Math.max(0.2, lockHint) }}
        >
          <div className="bg-zinc-800 rounded-full p-2">
            <Lock className="h-4 w-4 text-white" />
          </div>
        </div>
        <div className="flex w-full items-center justify-center gap-3 bg-red-600 px-4 py-3">
          <div className="h-2 w-2 rounded-full bg-white animate-pulse" />
          <span className="text-white text-sm font-medium">{formatTime(elapsed)}</span>
          {waveformEl}
        </div>
      </div>
    );
  }

  // -- Locked recording bar --
  if (mode === "locked-recording") {
    return (
      <div className="shrink-0 safe-bottom">
        <button
          type="button"
          onClick={handleLockedStop}
          className="flex w-full items-center justify-center gap-2 bg-red-600 px-4 py-3 cursor-pointer"
        >
          <div className="h-2 w-2 rounded-full bg-white animate-pulse" />
          <span className="text-white text-sm font-medium">{formatTime(elapsed)}</span>
          {waveformEl}
          <Square className="ml-3 h-4 w-4 text-white shrink-0" />
        </button>
      </div>
    );
  }

  // -- Voice mode bar --
  if (mode === "voice-mode") {
    return (
      <div className="shrink-0 safe-bottom">
        <button
          type="button"
          onClick={stopVoiceMode}
          className="flex w-full items-center justify-center gap-2 bg-red-600 px-4 py-3 cursor-pointer"
        >
          <div className="h-2 w-2 rounded-full bg-white animate-pulse" />
          <span className="text-white text-sm font-medium">{formatTime(elapsed)}</span>
          {waveformEl}
          <Square className="ml-3 h-4 w-4 text-white shrink-0" />
        </button>
      </div>
    );
  }

  // -- Idle bar --
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="flex items-center gap-2 px-3 py-2 border-t border-border bg-background shrink-0 safe-bottom">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0"
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled}
                aria-label="Attach file"
              >
                <Paperclip className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Attach file</TooltipContent>
          </Tooltip>
          <input ref={fileInputRef} type="file" className="hidden" onChange={handleFile} />
          <input
            className="flex-1 h-9 bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
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
          />
          {hasText ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  onClick={handleSend}
                  disabled={disabled}
                  aria-label="Send message"
                >
                  <Send className="h-4 w-4" />
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
                    className="h-9 w-9 shrink-0 touch-none"
                    onPointerDown={handleMicPointerDown}
                    onPointerMove={handleMicPointerMove}
                    onPointerUp={handleMicPointerUp}
                    disabled={disabled}
                    aria-label="Push to talk"
                  >
                    <Mic className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Hold to talk</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="default"
                    size="icon"
                    className="h-9 w-9 shrink-0 rounded-full"
                    onClick={startVoiceMode}
                    disabled={disabled}
                    aria-label="Voice mode"
                  >
                    <AudioLines className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Voice mode</TooltipContent>
              </Tooltip>
            </>
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuCheckboxItem checked={canvasMode} onSelect={onToggleView}>
          Canvas view
        </ContextMenuCheckboxItem>
        <ContextMenuCheckboxItem checked={!canvasMode} onSelect={onToggleView}>
          Chat view
        </ContextMenuCheckboxItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function getSupportedMimeType(): string {
  for (const mime of ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"]) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return "";
}

async function ensureChannelReady(
  bridge: BrowserBridge,
  channel: string,
  timeoutMs = 5000,
): Promise<boolean> {
  if (bridge.isChannelOpen(channel)) return true;
  const dc = bridge.openChannel(channel);
  if (!dc) return false;
  if (dc.readyState === "open") return true;
  return await new Promise<boolean>((resolve) => {
    let settled = false;
    const done = (value: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(value);
    };
    const timeout = setTimeout(() => done(false), timeoutMs);
    dc.addEventListener("open", () => done(true), { once: true });
    dc.addEventListener("close", () => done(false), { once: true });
  });
}
