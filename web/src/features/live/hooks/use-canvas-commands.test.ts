// @vitest-environment jsdom

import { COMMAND_PROTOCOL_VERSION } from "@shared/command-protocol-core";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import type { BridgeState, BrowserBridge } from "~/features/live/lib/webrtc-browser";
import { buildInterruptedCommandState, useCanvasCommands } from "./use-canvas-commands";

interface HookHarnessProps {
  bridgeState: BridgeState;
  liveMode: boolean;
}

let latestHook: ReturnType<typeof useCanvasCommands> | null = null;
(
  globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  }
).IS_REACT_ACT_ENVIRONMENT = true;

function HookHarness({ bridgeState, liveMode }: HookHarnessProps) {
  latestHook = useCanvasCommands({
    bridgeRef: { current: null } as { current: BrowserBridge | null },
    bridgeState,
    liveMode,
  });
  return null;
}

describe("buildInterruptedCommandState", () => {
  it("returns a failure result for every active command and keeps the latest summary", () => {
    const interrupted = buildInterruptedCommandState(
      {
        "call-1": {
          callId: "call-1",
          name: "alpha",
          phase: "running",
          updatedAt: 10,
        },
        "call-2": {
          callId: "call-2",
          name: "beta",
          phase: "canceling",
          updatedAt: 20,
        },
      },
      {
        code: "COMMAND_INTERRUPTED",
        message: "Command interrupted because the live connection was lost.",
      },
    );

    expect(interrupted).not.toBeNull();
    expect(interrupted?.outboundMessages).toHaveLength(2);
    expect(interrupted?.outboundMessages.map((entry) => entry.payload.callId)).toEqual([
      "call-1",
      "call-2",
    ]);
    expect(interrupted?.outboundMessages.every((entry) => entry.payload.ok === false)).toBe(true);
    expect(interrupted?.lastCompleted).toMatchObject({
      callId: "call-2",
      name: "beta",
      phase: "failed",
      errorMessage: "Command interrupted because the live connection was lost.",
    });
  });
});

describe("useCanvasCommands", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  afterEach(() => {
    if (root) {
      act(() => root?.unmount());
    }
    container?.remove();
    container = null;
    root = null;
    latestHook = null;
  });

  it("clears failed command state when reset is called", async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        createElement(HookHarness, {
          bridgeState: "failed",
          liveMode: true,
        }),
      );
    });

    act(() => {
      latestHook?.onCanvasBridgeMessage({
        source: "pub-canvas",
        type: "command.invoke",
        payload: {
          v: COMMAND_PROTOCOL_VERSION,
          callId: "call-1",
          name: "render",
          args: {},
        },
      });
    });

    expect(latestHook?.command).toMatchObject({
      phase: "failed",
      errorMessage: "Agent is not connected. Commands are unavailable.",
    });

    act(() => {
      latestHook?.reset();
    });

    expect(latestHook?.command).toMatchObject({
      phase: "idle",
      errorMessage: null,
    });
  });
});
