import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { CHANNELS, makeStreamEnd, makeStreamStart } from "~/lib/bridge-protocol";
import type { BrowserBridge } from "~/lib/webrtc-browser";
import { ensureChannelReady } from "~/lib/webrtc-channel";

const LOCK_DRAG_THRESHOLD = 40;

export type BarMode = "idle" | "push-recording" | "locked-recording" | "voice-mode";

interface UseControlBarAudioOptions {
  disabled: boolean;
  bridge: BrowserBridge | null;
  onSendAudio: (blob: Blob) => void;
}

function getSupportedMimeType(): string {
  for (const mime of ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"]) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return "";
}

export function useControlBarAudio({ disabled, bridge, onSendAudio }: UseControlBarAudioOptions) {
  const [mode, setMode] = useState<BarMode>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [lockHint, setLockHint] = useState(0);

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
  const pointerIsDownRef = useRef(false);
  const pendingReleaseRef = useRef(false);

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
    return stream;
  }, []);

  const finishPushRecording = useCallback(() => {
    setLockHint(0);
    if (lockedRef.current) {
      setMode("locked-recording");
      return;
    }
    cleanup();
    setMode("idle");
  }, [cleanup]);

  const handleMicPointerDown = useCallback(
    async (e: ReactPointerEvent<HTMLButtonElement>) => {
      if (disabled || mode !== "idle") return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      pointerIsDownRef.current = true;
      pendingReleaseRef.current = false;
      initialYRef.current = e.clientY;
      lockedRef.current = false;
      setLockHint(0);

      try {
        const stream = await setupAudio();
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
        if (pendingReleaseRef.current) {
          pendingReleaseRef.current = false;
          finishPushRecording();
        }
      } catch {
        // Permission denied or media setup failed; return to idle state.
        pointerIsDownRef.current = false;
        pendingReleaseRef.current = false;
        cleanup();
      }
    },
    [
      disabled,
      mode,
      setupAudio,
      onSendAudio,
      startTimer,
      animateWaveform,
      finishPushRecording,
      cleanup,
    ],
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

  const handleMicPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>) => {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }

      pointerIsDownRef.current = false;
      if (mode !== "push-recording") {
        pendingReleaseRef.current = true;
        return;
      }
      finishPushRecording();
    },
    [mode, finishPushRecording],
  );

  const handleMicPointerCancel = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>) => {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      pointerIsDownRef.current = false;
      if (mode !== "push-recording") {
        pendingReleaseRef.current = true;
        return;
      }
      lockedRef.current = false;
      finishPushRecording();
    },
    [mode, finishPushRecording],
  );

  useEffect(() => {
    if (mode !== "push-recording") return;
    if (pointerIsDownRef.current) return;
    if (!pendingReleaseRef.current) return;

    pendingReleaseRef.current = false;
    finishPushRecording();
  }, [mode, finishPushRecording]);

  const stopLockedRecording = useCallback(() => {
    if (streamIdRef.current) {
      streamIdRef.current = null;
    }
    cleanup();
    setMode("idle");
  }, [cleanup]);

  const startVoiceMode = useCallback(async () => {
    if (disabled || !bridge) return;
    try {
      const stream = await setupAudio();
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
      // Voice mode setup failed; reset recorder state.
      cleanup();
    }
  }, [disabled, bridge, setupAudio, cleanup, startTimer, animateWaveform]);

  const stopVoiceMode = useCallback(() => {
    if (bridge && streamIdRef.current) {
      bridge.send(CHANNELS.AUDIO, makeStreamEnd(streamIdRef.current));
      streamIdRef.current = null;
    }
    cleanup();
    setMode("idle");
  }, [bridge, cleanup]);

  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  return {
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
  };
}
