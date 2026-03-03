import { useCallback, useEffect, useReducer, useRef } from "react";
import { CHANNELS, makeStreamEnd, makeStreamStart } from "~/lib/bridge-protocol";
import type { BrowserBridge } from "~/lib/webrtc-browser";
import { ensureChannelReady } from "~/lib/webrtc-channel";
import {
  canStartRecording,
  canStartVoice,
  INITIAL_AUDIO_MACHINE_STATE,
  reduceAudioMachine,
  toBarMode,
} from "./control-bar-audio-machine";

export type { BarMode } from "./control-bar-audio-machine";

interface UseControlBarAudioOptions {
  disabled: boolean;
  bridge: BrowserBridge | null;
  micGranted: boolean;
  onMicGranted: (granted: boolean) => void;
  onSendAudio: (blob: Blob) => void;
}

function getSupportedMimeType(): string {
  for (const mime of ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"]) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return "";
}

export function useControlBarAudio({
  disabled,
  bridge,
  micGranted,
  onMicGranted,
  onSendAudio,
}: UseControlBarAudioOptions) {
  const [state, dispatch] = useReducer(reduceAudioMachine, INITIAL_AUDIO_MACHINE_STATE);

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
  const elapsedRef = useRef(0);

  const animateWaveform = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const data = new Uint8Array(analyser.frequencyBinCount);

    function draw() {
      if (!analyserRef.current) return;
      analyserRef.current.getByteFrequencyData(data);
      const container = barsRef.current;
      if (container) {
        const bars = container.children;
        for (let i = 0; i < bars.length; i++) {
          const value = data[i % data.length] / 255;
          const height = Math.max(4, value * 32);
          (bars[i] as HTMLElement).style.height = `${height}px`;
        }
      }
      animFrameRef.current = requestAnimationFrame(draw);
    }
    draw();
  }, []);

  const startTimer = useCallback((resetElapsed: boolean) => {
    if (resetElapsed) dispatch({ type: "RESET_ELAPSED" });
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => dispatch({ type: "TICK" }), 1000);
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: run once on mount to warm mic permission
  useEffect(() => {
    if (!micGranted) return;
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        for (const track of stream.getTracks()) track.stop();
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "NotAllowedError") {
          onMicGranted(false);
        }
      });
  }, []);

  useEffect(() => {
    elapsedRef.current = state.elapsed;
  }, [state.elapsed]);

  const stopLocalRecording = useCallback(
    (send: boolean) => {
      const shouldSend = send && elapsedRef.current >= 1;
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === "inactive") {
        shouldSendOnStopRef.current = false;
        audioChunksRef.current = [];
        localStopInProgressRef.current = false;
        releaseMediaResources();
        dispatch({ type: "RECORDING_STOP_FINISHED" });
        return;
      }

      shouldSendOnStopRef.current = shouldSend;
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
        dispatch({ type: "RECORDING_STOP_FINISHED" });
      }
    },
    [releaseMediaResources, stopTimer],
  );

  const startRecording = useCallback(async (): Promise<boolean> => {
    if (disabled || !canStartRecording(state.mode) || localStopInProgressRef.current) return false;

    dispatch({ type: "START_RECORDING_REQUEST" });

    try {
      const stream = await setupAudio();
      onMicGranted(true);
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
        localStopInProgressRef.current = false;
        if (mediaRecorderRef.current !== recorder) return;
        const shouldSend = shouldSendOnStopRef.current;
        shouldSendOnStopRef.current = false;
        const blob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || mimeType || "audio/webm",
        });
        audioChunksRef.current = [];
        if (shouldSend && blob.size > 0) onSendAudio(blob);
        releaseMediaResources();
        dispatch({ type: "RECORDING_STOP_FINISHED" });
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      dispatch({ type: "START_RECORDING_SUCCESS" });
      startTimer(true);
      animateWaveform();
      return true;
    } catch (error) {
      console.error("Failed to start recording", error);
      if (error instanceof DOMException && error.name === "NotAllowedError") {
        onMicGranted(false);
      }
      shouldSendOnStopRef.current = false;
      audioChunksRef.current = [];
      localStopInProgressRef.current = false;
      dispatch({ type: "START_RECORDING_FAILURE" });
      teardownMediaState(true);
      return false;
    }
  }, [
    disabled,
    state.mode,
    setupAudio,
    onMicGranted,
    onSendAudio,
    startTimer,
    animateWaveform,
    teardownMediaState,
    releaseMediaResources,
  ]);

  const cancelRecording = useCallback(() => {
    dispatch({ type: "REQUEST_RECORDING_STOP", intent: "cancel" });
  }, []);

  const sendRecording = useCallback(() => {
    dispatch({ type: "REQUEST_RECORDING_STOP", intent: "send" });
  }, []);

  const pauseRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || state.mode !== "recording") return;
    if (recorder.state !== "recording") return;

    recorder.pause();
    stopTimer();
    dispatch({ type: "PAUSE_RECORDING" });
  }, [state.mode, stopTimer]);

  const resumeRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || state.mode !== "recording-paused") return;
    if (recorder.state !== "paused") return;

    recorder.resume();
    startTimer(false);
    dispatch({ type: "RESUME_RECORDING" });
  }, [state.mode, startTimer]);

  const startVoiceMode = useCallback(async () => {
    if (disabled || !bridge || !canStartVoice(state.mode)) return;
    dispatch({ type: "START_VOICE_REQUEST" });

    try {
      const stream = await setupAudio();
      onMicGranted(true);
      const mime = getSupportedMimeType();

      const ready = await ensureChannelReady(bridge, CHANNELS.AUDIO);
      if (!ready) {
        dispatch({ type: "START_VOICE_FAILURE" });
        teardownMediaState(true);
        return;
      }

      const startMsg = makeStreamStart({ mime });
      if (!bridge.send(CHANNELS.AUDIO, startMsg)) {
        console.warn("Failed to send voice stream start event");
      }
      streamIdRef.current = startMsg.id;

      const recorder = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);
      recorder.ondataavailable = async (ev) => {
        if (ev.data.size > 0 && streamIdRef.current) {
          const buf = await ev.data.arrayBuffer();
          if (!bridge.sendBinary(CHANNELS.AUDIO, buf)) {
            console.warn("Failed to send voice stream chunk");
          }
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start(2000);
      dispatch({ type: "START_VOICE_SUCCESS" });
      startTimer(true);
      animateWaveform();
    } catch (error) {
      console.error("Failed to start voice mode", error);
      if (error instanceof DOMException && error.name === "NotAllowedError") {
        onMicGranted(false);
      }
      dispatch({ type: "START_VOICE_FAILURE" });
      teardownMediaState(true);
    }
  }, [
    disabled,
    bridge,
    state.mode,
    setupAudio,
    onMicGranted,
    teardownMediaState,
    startTimer,
    animateWaveform,
  ]);

  const stopVoiceMode = useCallback(() => {
    dispatch({ type: "REQUEST_VOICE_STOP" });
  }, []);

  useEffect(() => {
    if (state.mode !== "stopping-recording") return;
    if (localStopInProgressRef.current) return;
    stopLocalRecording(state.stopIntent === "send");
  }, [state.mode, state.stopIntent, stopLocalRecording]);

  useEffect(() => {
    if (state.mode !== "stopping-voice") return;

    if (bridge && streamIdRef.current) {
      if (!bridge.send(CHANNELS.AUDIO, makeStreamEnd(streamIdRef.current))) {
        console.warn("Failed to send voice stream end event");
      }
      streamIdRef.current = null;
    }
    teardownMediaState(true);
    dispatch({ type: "VOICE_STOP_FINISHED" });
  }, [state.mode, bridge, teardownMediaState]);

  useEffect(() => {
    return () => {
      shouldSendOnStopRef.current = false;
      localStopInProgressRef.current = false;
      teardownMediaState(true);
    };
  }, [teardownMediaState]);

  return {
    barsRef,
    cancelRecording,
    elapsed: state.elapsed,
    mode: toBarMode(state.mode),
    pauseRecording,
    resumeRecording,
    sendRecording,
    startRecording,
    startVoiceMode,
    stopVoiceMode,
  };
}
