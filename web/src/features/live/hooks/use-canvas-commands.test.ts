// @vitest-environment jsdom

import {
  COMMAND_INVOKE_EVENT,
  COMMAND_PROTOCOL_VERSION,
  COMMAND_RESULT_EVENT,
} from "@shared/command-protocol-core";
import type { LiveRuntimeStateSnapshot } from "@shared/live-runtime-state-core";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BridgeMessage } from "~/features/live/lib/bridge-protocol";
import type { CanvasBridgeCommandMessage } from "~/features/live/types/live-types";
import { buildInterruptedCommandState, useCanvasCommands } from "./use-canvas-commands";

function createMockChannelOps() {
  return {
    sendWithAckOnChannel: vi.fn(
      async (_channel: string, _message: BridgeMessage, _timeoutMs?: number) => true,
    ),
    ensureChannel: vi.fn(async (_channel: string, _timeoutMs?: number) => true),
  };
}

function makeInvokeMessage(
  name: string,
  callId: string,
  args: Record<string, unknown> = {},
): CanvasBridgeCommandMessage {
  return {
    source: "pub-canvas" as const,
    type: COMMAND_INVOKE_EVENT,
    payload: {
      v: COMMAND_PROTOCOL_VERSION,
      callId,
      name,
      args,
    },
  };
}

interface HookHarnessProps {
  sendWithAckOnChannel: (
    channel: string,
    message: BridgeMessage,
    timeoutMs?: number,
  ) => Promise<boolean>;
  ensureChannel: (channel: string, timeoutMs?: number) => Promise<boolean>;
  canvasScopeKey?: string;
  commandsPaused?: boolean;
  runtimeState?: LiveRuntimeStateSnapshot;
  liveMode: boolean;
  sessionKey?: string;
}

let latestHook: ReturnType<typeof useCanvasCommands> | null = null;
/** Captures every non-null outboundCanvasBridgeMessage seen during render (before auto-clear). */
let observedOutboundMessages: NonNullable<
  ReturnType<typeof useCanvasCommands>["outboundCanvasBridgeMessage"]
>[] = [];
(
  globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  }
).IS_REACT_ACT_ENVIRONMENT = true;

function HookHarness({
  sendWithAckOnChannel,
  ensureChannel,
  canvasScopeKey = "canvas-1",
  commandsPaused = false,
  runtimeState = {
    agentActivity: "idle",
    agentState: "idle",
    connectionState: "idle",
    executorState: "idle",
  },
  liveMode,
  sessionKey = "session-1",
}: HookHarnessProps) {
  latestHook = useCanvasCommands({
    sendWithAckOnChannel,
    ensureChannel,
    canvasScopeKey,
    commandsPaused,
    runtimeState,
    liveMode,
    sessionKey,
  });
  if (latestHook.outboundCanvasBridgeMessage) {
    observedOutboundMessages.push(latestHook.outboundCanvasBridgeMessage);
  }
  return null;
}

function renderHarness(root: Root, props: HookHarnessProps) {
  return act(async () => {
    root.render(createElement(HookHarness, props));
  });
}

function createRuntimeState(
  overrides: Partial<LiveRuntimeStateSnapshot>,
): LiveRuntimeStateSnapshot {
  return {
    agentActivity: "idle",
    agentState: "idle",
    connectionState: "idle",
    executorState: "idle",
    ...overrides,
  };
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

  beforeEach(() => {
    latestHook = null;
    observedOutboundMessages = [];
  });

  afterEach(() => {
    if (root) {
      act(() => root?.unmount());
    }
    container?.remove();
    container = null;
    root = null;
    latestHook = null;
  });

  function setup() {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    return root;
  }

  it("clears failed command state when reset is called", async () => {
    const r = setup();
    const ops = createMockChannelOps();

    await renderHarness(r, {
      ...ops,
      runtimeState: createRuntimeState({ connectionState: "failed" }),
      liveMode: true,
    });

    act(() => {
      latestHook?.onCanvasBridgeMessage(makeInvokeMessage("render", "call-1"));
    });

    expect(latestHook?.command).toMatchObject({
      phase: "failed",
      errorMessage: "Commands require a live connection.",
    });

    act(() => {
      latestHook?.reset();
    });

    expect(latestHook?.command).toMatchObject({
      phase: "idle",
      errorMessage: null,
    });
  });

  it("dispatches commands immediately once the transport is connected", async () => {
    const r = setup();
    const ops = createMockChannelOps();

    await renderHarness(r, {
      ...ops,
      runtimeState: createRuntimeState({
        connectionState: "connected",
        executorState: "loading",
      }),
      liveMode: true,
    });

    await act(async () => {
      latestHook?.onCanvasBridgeMessage(makeInvokeMessage("listEmails", "call-list"));
    });

    expect(latestHook?.command).toMatchObject({
      phase: "running",
      activeCommandName: "listEmails",
      activeCallId: "call-list",
    });

    expect(ops.sendWithAckOnChannel).toHaveBeenCalled();
  });

  it("fails commands immediately when liveMode is false", async () => {
    const r = setup();
    const ops = createMockChannelOps();

    await renderHarness(r, {
      ...ops,
      runtimeState: createRuntimeState({ connectionState: "idle" }),
      liveMode: false,
    });

    act(() => {
      latestHook?.onCanvasBridgeMessage(makeInvokeMessage("listEmails", "call-1"));
    });

    expect(latestHook?.command).toMatchObject({
      phase: "failed",
      errorMessage: "Live mode is disabled. Commands are unavailable.",
    });
  });

  it("fails commands immediately when connection state is failed", async () => {
    const r = setup();
    const ops = createMockChannelOps();

    await renderHarness(r, {
      ...ops,
      runtimeState: createRuntimeState({ connectionState: "failed" }),
      liveMode: true,
    });

    act(() => {
      latestHook?.onCanvasBridgeMessage(makeInvokeMessage("listEmails", "call-1"));
    });

    expect(latestHook?.command).toMatchObject({
      phase: "failed",
      errorMessage: "Commands require a live connection.",
    });
  });

  it("queues commands until the transport becomes connected", async () => {
    const r = setup();
    const ops = createMockChannelOps();

    await renderHarness(r, {
      ...ops,
      runtimeState: createRuntimeState({ connectionState: "idle" }),
      liveMode: true,
    });

    act(() => {
      latestHook?.onCanvasBridgeMessage(makeInvokeMessage("listEmails", "call-startup"));
    });

    expect(latestHook?.command).toMatchObject({ phase: "idle" });
    expect(ops.sendWithAckOnChannel).not.toHaveBeenCalled();

    await renderHarness(r, {
      ...ops,
      runtimeState: createRuntimeState({
        connectionState: "connected",
        executorState: "loading",
      }),
      liveMode: true,
    });

    expect(latestHook?.command).toMatchObject({
      phase: "running",
      activeCommandName: "listEmails",
      activeCallId: "call-startup",
    });
    expect(ops.sendWithAckOnChannel).toHaveBeenCalled();
  });

  it("queues multiple commands and drains all of them when the transport connects", async () => {
    const r = setup();
    const ops = createMockChannelOps();

    await renderHarness(r, {
      ...ops,
      runtimeState: createRuntimeState({ connectionState: "idle" }),
      liveMode: true,
    });

    act(() => {
      latestHook?.onCanvasBridgeMessage(makeInvokeMessage("listEmails", "call-1"));
      latestHook?.onCanvasBridgeMessage(
        makeInvokeMessage("getEmail", "call-2", { filter: "unread" }),
      );
    });

    expect(ops.sendWithAckOnChannel).not.toHaveBeenCalled();

    await renderHarness(r, {
      ...ops,
      runtimeState: createRuntimeState({
        connectionState: "connected",
        executorState: "loading",
      }),
      liveMode: true,
    });

    expect(ops.sendWithAckOnChannel).toHaveBeenCalledTimes(2);
    expect(latestHook?.command.activeCount).toBe(2);
  });

  it("handles realistic startup from closed to connecting to connected with queued commands", async () => {
    const r = setup();
    const ops = createMockChannelOps();

    await renderHarness(r, {
      ...ops,
      runtimeState: createRuntimeState({ connectionState: "idle" }),
      liveMode: true,
    });

    act(() => {
      latestHook?.onCanvasBridgeMessage(makeInvokeMessage("listEmails", "call-inbox"));
    });

    expect(latestHook?.command.phase).toBe("idle");

    await renderHarness(r, {
      ...ops,
      runtimeState: createRuntimeState({
        connectionState: "connecting",
        executorState: "idle",
      }),
      liveMode: true,
    });

    expect(ops.sendWithAckOnChannel).not.toHaveBeenCalled();
    expect(latestHook?.command.phase).toBe("idle");

    await renderHarness(r, {
      ...ops,
      runtimeState: createRuntimeState({
        connectionState: "connected",
        executorState: "loading",
      }),
      liveMode: true,
    });

    expect(ops.sendWithAckOnChannel).toHaveBeenCalled();
    expect(latestHook?.command).toMatchObject({
      phase: "running",
      activeCommandName: "listEmails",
      activeCallId: "call-inbox",
    });
  });

  it("fails queued commands when connection state transitions to failed", async () => {
    const r = setup();
    const ops = createMockChannelOps();

    await renderHarness(r, {
      ...ops,
      runtimeState: createRuntimeState({ connectionState: "idle" }),
      liveMode: true,
    });

    act(() => {
      latestHook?.onCanvasBridgeMessage(makeInvokeMessage("listEmails", "call-1"));
    });
    expect(latestHook?.command.phase).toBe("idle");

    await renderHarness(r, {
      ...ops,
      runtimeState: createRuntimeState({ connectionState: "failed" }),
      liveMode: true,
    });

    // outboundCanvasBridgeMessage is transient (auto-cleared via setTimeout(0)),
    // so act(async) may flush it before we can observe. Use the render-time capture instead.
    const msg = latestHook?.outboundCanvasBridgeMessage ?? observedOutboundMessages.at(-1);
    expect(msg).toBeDefined();
    expect(msg?.payload.ok).toBe(false);
    expect(msg?.payload.callId).toBe("call-1");
  });

  it("clears pending queue when canvasScopeKey changes", async () => {
    const r = setup();
    const ops = createMockChannelOps();

    await renderHarness(r, {
      ...ops,
      runtimeState: createRuntimeState({ connectionState: "idle" }),
      liveMode: true,
      canvasScopeKey: "slug:1",
    });

    act(() => {
      latestHook?.onCanvasBridgeMessage(makeInvokeMessage("listEmails", "call-old"));
    });

    await renderHarness(r, {
      ...ops,
      runtimeState: createRuntimeState({ connectionState: "idle" }),
      liveMode: true,
      canvasScopeKey: "slug:2",
    });

    await renderHarness(r, {
      ...ops,
      runtimeState: createRuntimeState({
        connectionState: "connected",
        executorState: "loading",
      }),
      liveMode: true,
      canvasScopeKey: "slug:2",
    });

    expect(ops.sendWithAckOnChannel).not.toHaveBeenCalled();
    expect(latestHook?.command.phase).toBe("idle");
  });

  it("pending commands survive sessionKey change and drain when the transport connects", async () => {
    const r = setup();
    const ops = createMockChannelOps();

    await renderHarness(r, {
      ...ops,
      runtimeState: createRuntimeState({ connectionState: "idle" }),
      liveMode: true,
      sessionKey: "slug:unselected:0",
    });

    act(() => {
      latestHook?.onCanvasBridgeMessage(makeInvokeMessage("cwd", "call-auto"));
    });

    expect(latestHook?.command.phase).toBe("idle");
    expect(ops.sendWithAckOnChannel).not.toHaveBeenCalled();

    await renderHarness(r, {
      ...ops,
      runtimeState: createRuntimeState({ connectionState: "idle" }),
      liveMode: true,
      sessionKey: "slug:agent-1:0",
    });

    expect(ops.sendWithAckOnChannel).not.toHaveBeenCalled();

    await renderHarness(r, {
      ...ops,
      runtimeState: createRuntimeState({
        connectionState: "connected",
        executorState: "loading",
      }),
      liveMode: true,
      sessionKey: "slug:agent-1:0",
    });

    expect(ops.sendWithAckOnChannel).toHaveBeenCalled();
    expect(latestHook?.command).toMatchObject({
      phase: "running",
      activeCommandName: "cwd",
      activeCallId: "call-auto",
    });
  });

  it("active commands interrupted on sessionKey change while paused commands preserved", async () => {
    const r = setup();
    const ops = createMockChannelOps();

    await renderHarness(r, {
      ...ops,
      runtimeState: createRuntimeState({
        connectionState: "connected",
        executorState: "ready",
      }),
      liveMode: true,
      sessionKey: "slug:agent-1:0",
    });

    await act(async () => {
      latestHook?.onCanvasBridgeMessage(makeInvokeMessage("active-cmd", "call-active"));
    });

    expect(latestHook?.command).toMatchObject({
      phase: "running",
      activeCallId: "call-active",
    });

    await renderHarness(r, {
      ...ops,
      runtimeState: createRuntimeState({
        connectionState: "connected",
        executorState: "loading",
      }),
      commandsPaused: true,
      liveMode: true,
      sessionKey: "slug:agent-1:0",
    });

    act(() => {
      latestHook?.onCanvasBridgeMessage(makeInvokeMessage("pending-cmd", "call-pending"));
    });

    await renderHarness(r, {
      ...ops,
      runtimeState: createRuntimeState({
        connectionState: "connected",
        executorState: "loading",
      }),
      commandsPaused: true,
      liveMode: true,
      sessionKey: "slug:agent-2:0",
    });

    const interruptMsg = observedOutboundMessages.find(
      (m) => m.type === COMMAND_RESULT_EVENT && m.payload.callId === "call-active",
    );
    expect(interruptMsg).toBeDefined();
    expect(interruptMsg?.payload.ok).toBe(false);

    ops.sendWithAckOnChannel.mockClear();
    await renderHarness(r, {
      ...ops,
      runtimeState: createRuntimeState({
        connectionState: "connected",
        executorState: "loading",
      }),
      commandsPaused: false,
      liveMode: true,
      sessionKey: "slug:agent-2:0",
    });

    expect(ops.sendWithAckOnChannel).toHaveBeenCalled();
    expect(latestHook?.command).toMatchObject({
      phase: "running",
      activeCommandName: "pending-cmd",
      activeCallId: "call-pending",
    });
  });
});
