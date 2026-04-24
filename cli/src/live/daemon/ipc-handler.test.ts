import { describe, expect, it, vi } from "vitest";
import { type IpcRequest, parseIpcRequest } from "../transport/ipc-protocol.js";
import { createDaemonIpcHandler } from "./ipc-handler.js";

function createHandlerHarness(overrides?: {
  activeSlug?: string | null;
  writeReadinessError?: string | null;
}) {
  const persistCanvasHtml = vi.fn(
    async () => ({ ok: true, delivered: true }) as Record<string, unknown>,
  );
  const persistFiles = vi.fn(
    async () => ({ ok: true, fileCount: 1, delivered: true }) as Record<string, unknown>,
  );
  const sendOutboundMessageWithAck = vi.fn(async () => true);

  const handler = createDaemonIpcHandler({
    persistCanvasHtml,
    persistFiles,
    getRuntimeState: () => ({
      connectionState: "connected",
      agentState: "ready",
      agentActivity: "idle",
      executorState: "idle",
    }),
    getSignalingConnected: () => true,
    getActiveSlug: () =>
      overrides && "activeSlug" in overrides ? (overrides.activeSlug ?? null) : "my-pub",
    getUptimeSeconds: () => 10,
    getChannels: () => [],
    getLastError: () => null,
    getBridgeMode: () => "claude-code",
    getBridgeStatus: () => null,
    getLogPath: () => null,
    getWriteReadinessError: () => overrides?.writeReadinessError ?? null,
    sendOutboundMessageWithAck,
    markAgentStreaming: vi.fn(),
    shutdown: vi.fn(),
    writeAckTimeoutMs: 5_000,
    writeAckMaxAttempts: 2,
    getBridgeSettings: () => ({ mode: "openclaw" }) as never,
    getBridgeRunner: () => null,
  });

  return { handler, persistCanvasHtml, persistFiles, sendOutboundMessageWithAck };
}

function canvasWriteRequest(html: string): IpcRequest {
  return {
    method: "write",
    params: {
      channel: "canvas",
      msg: { id: "msg-1", type: "html", data: html },
    },
  };
}

describe("ipc-handler canvas write", () => {
  it("delegates to persistCanvasHtml", async () => {
    const { handler, persistCanvasHtml } = createHandlerHarness();

    const result = await handler(canvasWriteRequest("<h1>hello</h1>"));

    expect(result).toEqual({ ok: true, delivered: true });
    expect(persistCanvasHtml).toHaveBeenCalledWith("<h1>hello</h1>");
  });

  it("returns the error from persistCanvasHtml", async () => {
    const { handler, persistCanvasHtml } = createHandlerHarness();
    persistCanvasHtml.mockResolvedValue({ ok: false, error: "No active live session." });

    const result = await handler(canvasWriteRequest("<h1>hello</h1>"));

    expect(result).toEqual({ ok: false, error: "No active live session." });
  });
});

describe("ipc-handler status and active-slug", () => {
  it("status reports activeSlug", async () => {
    const { handler } = createHandlerHarness({ activeSlug: "pub-b" });
    const result = await handler({ method: "status", params: {} });
    expect(result).toMatchObject({ ok: true, activeSlug: "pub-b" });
  });

  it("active-slug returns activeSlug", async () => {
    const { handler } = createHandlerHarness({ activeSlug: "pub-b" });
    const result = await handler({ method: "active-slug", params: {} });
    expect(result).toEqual({ ok: true, slug: "pub-b" });
  });
});

describe("ipc-handler run-command-spec", () => {
  it("executes an exec spec via the shared runner and returns the parsed value", async () => {
    const { handler } = createHandlerHarness();
    const req: IpcRequest = {
      method: "run-command-spec",
      params: {
        spec: {
          name: "echo.hello",
          returns: "text",
          executor: { kind: "exec", command: "printf", args: ["hello-%s", "{{who}}"] },
        },
        args: { who: "world" },
      },
    };
    const result = await handler(req);
    expect(result).toEqual({ ok: true, value: "hello-world" });
  });

  it("surfaces executor failures as ok:false with a message", async () => {
    const { handler } = createHandlerHarness();
    const req: IpcRequest = {
      method: "run-command-spec",
      params: {
        spec: {
          name: "fail",
          returns: "text",
          executor: { kind: "exec", command: "false", args: [] },
        },
        args: {},
      },
    };
    const result = (await handler(req)) as { ok: boolean; error?: string };
    expect(result.ok).toBe(false);
    expect(typeof result.error).toBe("string");
  });

  it("rejects a malformed spec at parse time", () => {
    const parsed = parseIpcRequest({
      method: "run-command-spec",
      params: { spec: { executor: { kind: "exec" } }, args: {} },
    });
    expect(parsed).toBeNull();
  });
});

describe("ipc-handler data channel write", () => {
  it("checks write readiness", async () => {
    const { handler, sendOutboundMessageWithAck } = createHandlerHarness({
      writeReadinessError: "Live session connection is not ready yet.",
    });

    const result = await handler({
      method: "write",
      params: { channel: "chat", msg: { id: "msg-2", type: "text", data: "hello" } },
    });

    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("not ready") });
    expect(sendOutboundMessageWithAck).not.toHaveBeenCalled();
  });

  it("fans the write through sendOutboundMessageWithAck", async () => {
    const { handler, sendOutboundMessageWithAck } = createHandlerHarness();

    const result = await handler({
      method: "write",
      params: { channel: "chat", msg: { id: "msg-3", type: "text", data: "hello" } },
    });

    expect(result).toEqual({ ok: true, delivered: true });
    expect(sendOutboundMessageWithAck).toHaveBeenCalledWith(
      "chat",
      expect.objectContaining({ id: "msg-3", type: "text" }),
      expect.objectContaining({ ackTimeoutMs: 5_000, maxAttempts: 2 }),
    );
  });

  it("surfaces an error when delivery fails", async () => {
    const { handler, sendOutboundMessageWithAck } = createHandlerHarness();
    sendOutboundMessageWithAck.mockResolvedValueOnce(false);

    const result = (await handler({
      method: "write",
      params: { channel: "chat", msg: { id: "msg-4", type: "text", data: "hi" } },
    })) as { ok: boolean; error?: string };

    expect(result.ok).toBe(false);
    expect(result.error).toContain("msg-4");
  });
});
