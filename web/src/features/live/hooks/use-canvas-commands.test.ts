// @vitest-environment jsdom

import { makeCanvasFileResultMessage } from "@shared/canvas-file-protocol-core";
import { COMMAND_PROTOCOL_VERSION } from "@shared/command-protocol-core";
import type { LiveRuntimeStateSnapshot } from "@shared/live-runtime-state-core";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BridgeMessage } from "~/features/live/lib/bridge-protocol";
import { CHANNELS, makeStreamEnd, makeStreamStart } from "~/features/live/lib/bridge-protocol";
import { buildInterruptedCommandState, useCanvasCommands } from "./use-canvas-commands";

// ---------------------------------------------------------------------------
// Mock channel ops
// ---------------------------------------------------------------------------

function createMockChannelOps() {
  return {
    sendOnChannel: vi.fn((_channel: string, _message: BridgeMessage) => true),
    sendBinaryOnChannel: vi.fn((_channel: string, _data: ArrayBuffer) => true),
    sendWithAckOnChannel: vi.fn(
      async (_channel: string, _message: BridgeMessage, _timeoutMs?: number) => true,
    ),
    ensureChannel: vi.fn(async (_channel: string, _timeoutMs?: number) => true),
  };
}

// ---------------------------------------------------------------------------
// Command message helpers
// ---------------------------------------------------------------------------

function makeInvokeMessage(name: string, callId: string, args: Record<string, unknown> = {}) {
  return {
    source: "pub-canvas" as const,
    type: "command.invoke" as const,
    payload: {
      v: COMMAND_PROTOCOL_VERSION,
      callId,
      name,
      args,
    },
  };
}

function makeFileUploadMessage(requestId: string, bytes: ArrayBuffer, mime = "audio/webm") {
  return {
    source: "pub-canvas" as const,
    type: "file.upload" as const,
    payload: {
      requestId,
      bytes,
      mime,
    },
  };
}

function makeFileDownloadMessage(requestId: string, path: string, filename?: string) {
  return {
    source: "pub-canvas" as const,
    type: "file.download" as const,
    payload: {
      requestId,
      path,
      filename,
    },
  };
}

// ---------------------------------------------------------------------------
// Hook harness
// ---------------------------------------------------------------------------

interface HookHarnessProps {
  sendOnChannel: (channel: string, message: BridgeMessage) => boolean;
  sendBinaryOnChannel: (channel: string, data: ArrayBuffer) => boolean;
  sendWithAckOnChannel: (
    channel: string,
    message: BridgeMessage,
    timeoutMs?: number,
  ) => Promise<boolean>;
  ensureChannel: (channel: string, timeoutMs?: number) => Promise<boolean>;
  canvasScopeKey?: string;
  runtimeState?: LiveRuntimeStateSnapshot;
  liveMode: boolean;
  sessionKey?: string;
}

let latestHook: ReturnType<typeof useCanvasCommands> | null = null;
(
  globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  }
).IS_REACT_ACT_ENVIRONMENT = true;

function HookHarness({
  sendOnChannel,
  sendBinaryOnChannel,
  sendWithAckOnChannel,
  ensureChannel,
  canvasScopeKey = "canvas-1",
  runtimeState = {
    connectionState: "idle",
    agentState: "idle",
    executorState: "idle",
  },
  liveMode,
  sessionKey = "session-1",
}: HookHarnessProps) {
  latestHook = useCanvasCommands({
    sendOnChannel,
    sendBinaryOnChannel,
    sendWithAckOnChannel,
    ensureChannel,
    canvasScopeKey,
    runtimeState,
    liveMode,
    sessionKey,
  });
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
    connectionState: "idle",
    agentState: "idle",
    executorState: "idle",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

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

  // --------------------------------------------------------------------------
  // Command dispatch – happy path
  // --------------------------------------------------------------------------

  it("dispatches commands immediately when executor is ready", async () => {
    const r = setup();
    const ops = createMockChannelOps();

    await renderHarness(r, {
      ...ops,
      runtimeState: createRuntimeState({
        connectionState: "connected",
        executorState: "ready",
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

  it("streams canvas uploads on the dedicated canvas-file channel", async () => {
    const r = setup();
    const ops = createMockChannelOps();
    const bytes = new Uint8Array([1, 2, 3]).buffer;

    await renderHarness(r, {
      ...ops,
      runtimeState: createRuntimeState({
        connectionState: "connected",
      }),
      liveMode: true,
    });

    await act(async () => {
      latestHook?.onCanvasBridgeMessage(makeFileUploadMessage("upload-1", bytes));
    });

    expect(ops.sendOnChannel).toHaveBeenCalledWith(
      CHANNELS.CANVAS_FILE,
      expect.objectContaining({
        id: "upload-1",
        type: "stream-start",
      }),
    );
    expect(ops.sendBinaryOnChannel).toHaveBeenCalledTimes(1);
    expect(ops.sendWithAckOnChannel).toHaveBeenCalledWith(
      CHANNELS.CANVAS_FILE,
      expect.objectContaining({
        type: "stream-end",
        meta: { streamId: "upload-1" },
      }),
      10_000,
    );

    act(() => {
      latestHook?.handleBridgeCanvasFileMessage({
        channel: CHANNELS.CANVAS_FILE,
        message: makeCanvasFileResultMessage({
          requestId: "upload-1",
          op: "upload",
          ok: true,
          file: {
            path: "/tmp/upload-1.webm",
            filename: "upload-1.webm",
            mime: "audio/webm",
            size: 3,
          },
        }),
        timestamp: Date.now(),
      });
    });

    expect(latestHook?.outboundCanvasBridgeMessage).toMatchObject({
      source: "pub-parent",
      type: "file.result",
      payload: {
        requestId: "upload-1",
        op: "upload",
        ok: true,
        file: {
          path: "/tmp/upload-1.webm",
        },
      },
    });
  });

  it("buffers daemon downloads and triggers a browser download on success", async () => {
    const r = setup();
    const ops = createMockChannelOps();
    const originalCreateObjectUrl = URL.createObjectURL;
    const originalRevokeObjectUrl = URL.revokeObjectURL;
    if (typeof URL.createObjectURL !== "function") {
      Object.defineProperty(URL, "createObjectURL", {
        configurable: true,
        value: () => "blob:download-url",
      });
    }
    if (typeof URL.revokeObjectURL !== "function") {
      Object.defineProperty(URL, "revokeObjectURL", {
        configurable: true,
        value: () => undefined,
      });
    }
    const downloadClick = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    const createObjectUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:download-url");
    const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    await renderHarness(r, {
      ...ops,
      runtimeState: createRuntimeState({
        connectionState: "connected",
      }),
      liveMode: true,
    });

    await act(async () => {
      latestHook?.onCanvasBridgeMessage(
        makeFileDownloadMessage("download-1", "/tmp/download-1.txt", "notes.txt"),
      );
    });

    expect(ops.sendWithAckOnChannel).toHaveBeenCalledWith(
      CHANNELS.CANVAS_FILE,
      expect.objectContaining({
        type: "event",
        data: "canvas.file.download.request",
      }),
      10_000,
    );

    act(() => {
      latestHook?.handleBridgeCanvasFileMessage({
        channel: CHANNELS.CANVAS_FILE,
        message: makeStreamStart(
          {
            filename: "notes.txt",
            mime: "text/plain",
            size: 3,
          },
          "download-1",
        ),
        timestamp: Date.now(),
      });
      latestHook?.handleBridgeCanvasFileMessage({
        channel: CHANNELS.CANVAS_FILE,
        message: {
          id: "bin-1",
          type: "binary",
          meta: { streamId: "download-1" },
        },
        binaryData: new TextEncoder().encode("hey").buffer,
        timestamp: Date.now(),
      });
      latestHook?.handleBridgeCanvasFileMessage({
        channel: CHANNELS.CANVAS_FILE,
        message: makeStreamEnd("download-1"),
        timestamp: Date.now(),
      });
      latestHook?.handleBridgeCanvasFileMessage({
        channel: CHANNELS.CANVAS_FILE,
        message: makeCanvasFileResultMessage({
          requestId: "download-1",
          op: "download",
          ok: true,
          file: {
            path: "/tmp/download-1.txt",
            filename: "notes.txt",
            mime: "text/plain",
            size: 3,
          },
        }),
        timestamp: Date.now(),
      });
    });

    expect(downloadClick).toHaveBeenCalledTimes(1);
    expect(createObjectUrl).toHaveBeenCalledTimes(1);
    expect(latestHook?.outboundCanvasBridgeMessage).toMatchObject({
      type: "file.result",
      payload: {
        requestId: "download-1",
        op: "download",
        ok: true,
      },
    });

    downloadClick.mockRestore();
    createObjectUrl.mockRestore();
    revokeObjectUrl.mockRestore();
    if (originalCreateObjectUrl === undefined) {
      Reflect.deleteProperty(URL, "createObjectURL");
    }
    if (originalRevokeObjectUrl === undefined) {
      Reflect.deleteProperty(URL, "revokeObjectURL");
    }
  });

  // --------------------------------------------------------------------------
  // Command dispatch – immediate failures
  // --------------------------------------------------------------------------

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

  // --------------------------------------------------------------------------
  // Queue-then-drain: the core startup flow
  // --------------------------------------------------------------------------

  it("queues commands until the executor becomes ready", async () => {
    const r = setup();
    const ops = createMockChannelOps();

    // Phase 1: executor is not ready yet
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

    // Phase 2: connected but executor still loading
    await renderHarness(r, {
      ...ops,
      runtimeState: createRuntimeState({
        connectionState: "connected",
        executorState: "loading",
      }),
      liveMode: true,
    });

    expect(ops.sendWithAckOnChannel).not.toHaveBeenCalled();

    // Phase 3: executor finishes loading
    await renderHarness(r, {
      ...ops,
      runtimeState: createRuntimeState({
        connectionState: "connected",
        executorState: "ready",
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

  it("queues multiple commands and drains all of them when the executor is ready", async () => {
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
        makeInvokeMessage("getEmail", "call-2", { threadId: "t1" }),
      );
    });

    expect(ops.sendWithAckOnChannel).not.toHaveBeenCalled();

    await renderHarness(r, {
      ...ops,
      runtimeState: createRuntimeState({
        connectionState: "connected",
        executorState: "ready",
      }),
      liveMode: true,
    });

    expect(ops.sendWithAckOnChannel).toHaveBeenCalledTimes(2);
    expect(latestHook?.command.activeCount).toBe(2);
  });

  // --------------------------------------------------------------------------
  // Realistic startup sequence: closed → connecting → connected
  // --------------------------------------------------------------------------

  it("handles realistic startup: closed → connecting → executor ready with queued commands", async () => {
    const r = setup();
    const ops = createMockChannelOps();

    // Step 1: bridge closed
    await renderHarness(r, {
      ...ops,
      runtimeState: createRuntimeState({ connectionState: "idle" }),
      liveMode: true,
    });

    // Step 2: Canvas fires listEmails() immediately
    act(() => {
      latestHook?.onCanvasBridgeMessage(makeInvokeMessage("listEmails", "call-inbox"));
    });

    expect(latestHook?.command.phase).toBe("idle");

    // Step 3: bridge starts connecting
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

    // Step 4: WebRTC connected but executor still loading
    await renderHarness(r, {
      ...ops,
      runtimeState: createRuntimeState({
        connectionState: "connected",
        executorState: "loading",
      }),
      liveMode: true,
    });

    expect(ops.sendWithAckOnChannel).not.toHaveBeenCalled();

    // Step 5: executor becomes ready
    await renderHarness(r, {
      ...ops,
      runtimeState: createRuntimeState({
        connectionState: "connected",
        executorState: "ready",
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

  // --------------------------------------------------------------------------
  // Failure drain: bridge fails after commands were queued
  // --------------------------------------------------------------------------

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

    const msg = latestHook?.outboundCanvasBridgeMessage ?? latestHook?.outboundQueue[0];
    expect(msg).toBeDefined();
    expect(msg?.payload.ok).toBe(false);
    expect(msg?.payload.callId).toBe("call-1");
  });

  // --------------------------------------------------------------------------
  // Scope change during pending queue
  // --------------------------------------------------------------------------

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
        executorState: "ready",
      }),
      liveMode: true,
      canvasScopeKey: "slug:2",
    });

    expect(ops.sendWithAckOnChannel).not.toHaveBeenCalled();
    expect(latestHook?.command.phase).toBe("idle");
  });
});
