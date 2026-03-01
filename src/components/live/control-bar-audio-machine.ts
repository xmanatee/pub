export type BarMode = "idle" | "recording" | "recording-paused" | "voice-mode";
export type RecordingStopIntent = "send" | "cancel";

export type AudioMachineMode =
  | "idle"
  | "starting-recording"
  | "recording"
  | "recording-paused"
  | "stopping-recording"
  | "starting-voice"
  | "voice-mode"
  | "stopping-voice";

export interface AudioMachineState {
  mode: AudioMachineMode;
  elapsed: number;
  pendingStopIntent: RecordingStopIntent | null;
  stopIntent: RecordingStopIntent | null;
}

export type AudioMachineEvent =
  | { type: "START_RECORDING_REQUEST" }
  | { type: "START_RECORDING_SUCCESS" }
  | { type: "START_RECORDING_FAILURE" }
  | { type: "REQUEST_RECORDING_STOP"; intent: RecordingStopIntent }
  | { type: "RECORDING_STOP_FINISHED" }
  | { type: "PAUSE_RECORDING" }
  | { type: "RESUME_RECORDING" }
  | { type: "START_VOICE_REQUEST" }
  | { type: "START_VOICE_SUCCESS" }
  | { type: "START_VOICE_FAILURE" }
  | { type: "REQUEST_VOICE_STOP" }
  | { type: "VOICE_STOP_FINISHED" }
  | { type: "TICK" }
  | { type: "RESET_ELAPSED" };

export const INITIAL_AUDIO_MACHINE_STATE: AudioMachineState = {
  mode: "idle",
  elapsed: 0,
  pendingStopIntent: null,
  stopIntent: null,
};

function toIdle(): AudioMachineState {
  return { ...INITIAL_AUDIO_MACHINE_STATE };
}

export function reduceAudioMachine(
  state: AudioMachineState,
  event: AudioMachineEvent,
): AudioMachineState {
  switch (event.type) {
    case "START_RECORDING_REQUEST":
      if (state.mode !== "idle") return state;
      return {
        mode: "starting-recording",
        elapsed: 0,
        pendingStopIntent: null,
        stopIntent: null,
      };

    case "START_RECORDING_SUCCESS":
      if (state.mode !== "starting-recording") return state;
      if (state.pendingStopIntent) {
        return {
          ...state,
          mode: "stopping-recording",
          pendingStopIntent: null,
          stopIntent: state.pendingStopIntent,
        };
      }
      return {
        ...state,
        mode: "recording",
        pendingStopIntent: null,
        stopIntent: null,
      };

    case "START_RECORDING_FAILURE":
      if (state.mode !== "starting-recording") return state;
      return toIdle();

    case "REQUEST_RECORDING_STOP":
      if (state.mode === "starting-recording") {
        return { ...state, pendingStopIntent: event.intent };
      }
      if (state.mode === "recording" || state.mode === "recording-paused") {
        return {
          ...state,
          mode: "stopping-recording",
          stopIntent: event.intent,
        };
      }
      return state;

    case "RECORDING_STOP_FINISHED":
      if (
        state.mode !== "stopping-recording" &&
        state.mode !== "recording" &&
        state.mode !== "recording-paused"
      ) {
        return state;
      }
      return toIdle();

    case "PAUSE_RECORDING":
      if (state.mode !== "recording") return state;
      return { ...state, mode: "recording-paused" };

    case "RESUME_RECORDING":
      if (state.mode !== "recording-paused") return state;
      return { ...state, mode: "recording" };

    case "START_VOICE_REQUEST":
      if (state.mode !== "idle") return state;
      return {
        mode: "starting-voice",
        elapsed: 0,
        pendingStopIntent: null,
        stopIntent: null,
      };

    case "START_VOICE_SUCCESS":
      if (state.mode !== "starting-voice") return state;
      return { ...state, mode: "voice-mode" };

    case "START_VOICE_FAILURE":
      if (state.mode !== "starting-voice") return state;
      return toIdle();

    case "REQUEST_VOICE_STOP":
      if (state.mode === "starting-voice" || state.mode === "voice-mode") {
        return { ...state, mode: "stopping-voice" };
      }
      return state;

    case "VOICE_STOP_FINISHED":
      if (
        state.mode !== "stopping-voice" &&
        state.mode !== "voice-mode" &&
        state.mode !== "starting-voice"
      ) {
        return state;
      }
      return toIdle();

    case "TICK":
      if (
        state.mode !== "recording" &&
        state.mode !== "recording-paused" &&
        state.mode !== "voice-mode"
      ) {
        return state;
      }
      return { ...state, elapsed: state.elapsed + 1 };

    case "RESET_ELAPSED":
      return { ...state, elapsed: 0 };

    default:
      return state;
  }
}

export function toBarMode(mode: AudioMachineMode): BarMode {
  if (mode === "recording") return "recording";
  if (mode === "recording-paused") return "recording-paused";
  if (mode === "voice-mode") return "voice-mode";
  return "idle";
}

export function canStartRecording(mode: AudioMachineMode): boolean {
  return mode === "idle";
}

export function canStartVoice(mode: AudioMachineMode): boolean {
  return mode === "idle";
}
