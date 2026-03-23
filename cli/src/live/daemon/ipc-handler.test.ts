import { describe, expect, it, vi } from "vitest";
import type { IpcRequest } from "../transport/ipc-protocol.js";
import { createDaemonIpcHandler } from "./ipc-handler.js";

function createHandlerHarness(overrides?: {
  activeSlug?: string | null;
  writeReadinessError?: string | null;
}) {
  const persistCanvasHtml = vi.fn(async () => ({ ok: true, delivered: true }) as Record<string, unknown>);
  const openDataChannel = vi.fn();

  const handler = createDaemonIpcHandler({
    persistCanvasHtml,
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
    openDataChannel,
    waitForChannelOpen: vi.fn(async () => {}),
    waitForDeliveryAck: vi.fn(async () => true),
    settlePendingAck: vi.fn(),
    markAgentStreaming: vi.fn(),
    markError: vi.fn(),
    shutdown: vi.fn(),
    writeAckTimeoutMs: 5_000,
    writeAckMaxAttempts: 2,
  });

  return { handler, persistCanvasHtml, openDataChannel };
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

describe("ipc-handler data channel write", () => {
  it("checks write readiness", async () => {
    const { handler, openDataChannel } = createHandlerHarness({
      writeReadinessError: "Live session connection is not ready yet.",
    });

    const result = await handler({
      method: "write",
      params: { channel: "chat", msg: { id: "msg-2", type: "text", data: "hello" } },
    });

    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("not ready") });
    expect(openDataChannel).not.toHaveBeenCalled();
  });
});
