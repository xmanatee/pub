import { describe, expect, it } from "vitest";
import {
  INITIAL_AUDIO_MACHINE_STATE,
  reduceAudioMachine,
} from "~/features/live-control-bar/model/control-bar-audio-machine";

describe("control bar audio machine", () => {
  it("starts recording cleanly after a failed start", () => {
    const firstAttempt = reduceAudioMachine(INITIAL_AUDIO_MACHINE_STATE, {
      type: "START_RECORDING_REQUEST",
    });
    const failed = reduceAudioMachine(firstAttempt, {
      type: "START_RECORDING_FAILURE",
    });
    const secondAttempt = reduceAudioMachine(failed, {
      type: "START_RECORDING_REQUEST",
    });
    const secondStarted = reduceAudioMachine(secondAttempt, {
      type: "START_RECORDING_SUCCESS",
    });

    expect(secondStarted.mode).toBe("recording");
    expect(secondStarted.stopIntent).toBeNull();
  });

  it("stops recording when stop is requested after recording starts", () => {
    const starting = reduceAudioMachine(INITIAL_AUDIO_MACHINE_STATE, {
      type: "START_RECORDING_REQUEST",
    });
    const recording = reduceAudioMachine(starting, {
      type: "START_RECORDING_SUCCESS",
    });
    const stopping = reduceAudioMachine(recording, {
      type: "REQUEST_RECORDING_STOP",
      intent: "cancel",
    });

    expect(stopping.mode).toBe("stopping-recording");
    expect(stopping.stopIntent).toBe("cancel");
  });
});
