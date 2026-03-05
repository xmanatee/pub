import { describe, expect, it } from "vitest";
import {
  INITIAL_AUDIO_MACHINE_STATE,
  reduceAudioMachine,
} from "~/features/live/model/control-bar-audio-machine";

describe("control bar audio machine", () => {
  it("preserves clean startup path after a failed start with pending send", () => {
    const firstStarting = reduceAudioMachine(INITIAL_AUDIO_MACHINE_STATE, {
      type: "START_RECORDING_REQUEST",
    });
    const queuedSend = reduceAudioMachine(firstStarting, {
      type: "REQUEST_RECORDING_STOP",
      intent: "send",
    });
    const failed = reduceAudioMachine(queuedSend, {
      type: "START_RECORDING_FAILURE",
    });
    const secondStarting = reduceAudioMachine(failed, {
      type: "START_RECORDING_REQUEST",
    });
    const secondStarted = reduceAudioMachine(secondStarting, {
      type: "START_RECORDING_SUCCESS",
    });

    expect(secondStarted.mode).toBe("recording");
    expect(secondStarted.stopIntent).toBeNull();
    expect(secondStarted.pendingStopIntent).toBeNull();
  });

  it("does not keep stale pending stop intent after start failure", () => {
    const starting = reduceAudioMachine(INITIAL_AUDIO_MACHINE_STATE, {
      type: "START_RECORDING_REQUEST",
    });
    const withPendingStop = reduceAudioMachine(starting, {
      type: "REQUEST_RECORDING_STOP",
      intent: "send",
    });
    const failed = reduceAudioMachine(withPendingStop, {
      type: "START_RECORDING_FAILURE",
    });

    expect(failed).toEqual(INITIAL_AUDIO_MACHINE_STATE);
  });

  it("moves to stopping state immediately after start success when stop was requested while starting", () => {
    const starting = reduceAudioMachine(INITIAL_AUDIO_MACHINE_STATE, {
      type: "START_RECORDING_REQUEST",
    });
    const withPendingStop = reduceAudioMachine(starting, {
      type: "REQUEST_RECORDING_STOP",
      intent: "cancel",
    });
    const started = reduceAudioMachine(withPendingStop, {
      type: "START_RECORDING_SUCCESS",
    });

    expect(started.mode).toBe("stopping-recording");
    expect(started.stopIntent).toBe("cancel");
    expect(started.pendingStopIntent).toBeNull();
  });
});
