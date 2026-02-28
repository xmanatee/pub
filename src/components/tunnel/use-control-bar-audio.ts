import { useCallback, useEffect, useRef, useState } from "react";
import { CHANNELS, makeStreamEnd, makeStreamStart } from "~/lib/bridge-protocol";
import type { BrowserBridge } from "~/lib/webrtc-browser";
import { ensureChannelReady } from "~/lib/webrtc-channel";

export type BarMode = "idle" | "recording" | "recording-paused" | "voice-mode";

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

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number>(0);
  const barsRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamIdRef = useRef<string | null>(null);
  const shouldSendOnStopRef = useRef(false);
  const localStopInProgressRef = useRef(false);
  const pendingActionRef = useRef<"send" | "cancel" | null>(null);

  const resetToIdle = useCallback(() => {
    setMode("idle");
    setElapsed(0);
  }, []);

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

  const startTimer = useCallback((resetElapsed: boolean) => {
    if (resetElapsed) setElapsed(0);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setElapsed((t) => t + 1), 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const releaseMediaResources = useCallback(() => {
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
    mediaRecorderRef.current = null;
    stopTimer();
  }, [stopTimer]);

  const teardownMediaState = useCallback(
    (stopRecorder: boolean) => {
      const recorder = mediaRecorderRef.current;
      if (stopRecorder && recorder && recorder.state !== "inactive") {
        recorder.stop();
      }
      releaseMediaResources();
    },
    [releaseMediaResources],
  );

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

  const startRecording = useCallback(async () => {
    if (disabled || mode !== "idle" || localStopInProgressRef.current) return;

    try {
      const stream = await setupAudio();
      const mimeType = getSupportedMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      audioChunksRef.current = [];
      shouldSendOnStopRef.current = false;
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) audioChunksRef.current.push(ev.data);
      };
      recorder.onstop = () => {
        if (mediaRecorderRef.current !== recorder) return;
        const shouldSend = shouldSendOnStopRef.current;
        shouldSendOnStopRef.current = false;
        const blob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || mimeType || "audio/webm",
        });
        audioChunksRef.current = [];
        if (shouldSend && blob.size > 0) onSendAudio(blob);
        localStopInProgressRef.current = false;
        releaseMediaResources();
        resetToIdle();
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setMode("recording");
      startTimer(true);
      animateWaveform();
    } catch (error) {
      console.error("Failed to start recording", error);
      shouldSendOnStopRef.current = false;
      audioChunksRef.current = [];
      localStopInProgressRef.current = false;
      pendingActionRef.current = null;
      teardownMediaState(true);
      resetToIdle();
    }
  }, [
    disabled,
    mode,
    setupAudio,
    onSendAudio,
    startTimer,
    animateWaveform,
    teardownMediaState,
    releaseMediaResources,
    resetToIdle,
  ]);

  const stopLocalRecording = useCallback(
    (send: boolean) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === "inactive") {
        shouldSendOnStopRef.current = false;
        audioChunksRef.current = [];
        localStopInProgressRef.current = false;
        releaseMediaResources();
        resetToIdle();
        return;
      }

      shouldSendOnStopRef.current = send;
      localStopInProgressRef.current = true;
      stopTimer();
      cancelAnimationFrame(animFrameRef.current);
      analyserRef.current = null;
      try {
        recorder.stop();
      } catch (error) {
        console.error("Failed to stop recording cleanly", error);
        shouldSendOnStopRef.current = false;
        audioChunksRef.current = [];
        localStopInProgressRef.current = false;
        releaseMediaResources();
        resetToIdle();
      }
    },
    [releaseMediaResources, stopTimer, resetToIdle],
  );

  const cancelRecording = useCallback(() => {
    if (mode === "idle") {
      pendingActionRef.current = "cancel";
      return;
    }
    stopLocalRecording(false);
  }, [mode, stopLocalRecording]);

  const sendRecording = useCallback(() => {
    if (mode === "idle") {
      pendingActionRef.current = "send";
      return;
    }
    stopLocalRecording(true);
  }, [mode, stopLocalRecording]);

  const pauseRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || mode !== "recording") return;
    if (recorder.state !== "recording") return;

    recorder.pause();
    stopTimer();
    setMode("recording-paused");
  }, [mode, stopTimer]);

  const resumeRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || mode !== "recording-paused") return;
    if (recorder.state !== "paused") return;

    recorder.resume();
    startTimer(false);
    setMode("recording");
  }, [mode, startTimer]);

  const startVoiceMode = useCallback(async () => {
    if (disabled || !bridge) return;
    try {
      const stream = await setupAudio();
      const mime = getSupportedMimeType();

      const ready = await ensureChannelReady(bridge, CHANNELS.AUDIO);
      if (!ready) {
        teardownMediaState(true);
        return;
      }

      const startMsg = makeStreamStart({ mime });
      bridge.send(CHANNELS.AUDIO, startMsg);
      streamIdRef.current = startMsg.id;

      const recorder = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);
      recorder.ondataavailable = async (ev) => {
        if (ev.data.size > 0 && streamIdRef.current) {
          const buf = await ev.data.arrayBuffer();
          bridge.sendBinary(CHANNELS.AUDIO, buf);
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start(2000);
      setMode("voice-mode");
      startTimer(true);
      animateWaveform();
    } catch (error) {
      console.error("Failed to start voice mode", error);
      teardownMediaState(true);
      resetToIdle();
    }
  }, [disabled, bridge, setupAudio, teardownMediaState, startTimer, animateWaveform, resetToIdle]);

  const stopVoiceMode = useCallback(() => {
    if (bridge && streamIdRef.current) {
      bridge.send(CHANNELS.AUDIO, makeStreamEnd(streamIdRef.current));
      streamIdRef.current = null;
    }
    teardownMediaState(true);
    resetToIdle();
  }, [bridge, teardownMediaState, resetToIdle]);

  useEffect(() => {
    if (mode !== "recording") return;
    const pending = pendingActionRef.current;
    if (!pending) return;
    pendingActionRef.current = null;
    stopLocalRecording(pending === "send");
  }, [mode, stopLocalRecording]);

  useEffect(() => {
    return () => {
      shouldSendOnStopRef.current = false;
      localStopInProgressRef.current = false;
      pendingActionRef.current = null;
      teardownMediaState(true);
    };
  }, [teardownMediaState]);

  return {
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
  };
}
