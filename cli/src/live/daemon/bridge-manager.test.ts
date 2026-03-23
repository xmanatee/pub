import { describe, expect, it, vi } from "vitest";
import { createBridgeManager } from "./bridge-manager.js";
import { createDaemonState } from "./state.js";

function createBridgeManagerHarness() {
  const state = createDaemonState();
  const updateMock = vi.fn(async () => ({}));
  const commandHandler = {
    beginManifestLoad: vi.fn(),
    bindFromHtml: vi.fn(),
    clearBindings: vi.fn(),
  };

  const manager = createBridgeManager({
    state,
    bridgeSettings: { mode: "claude-code" } as never,
    commandHandler,
    apiClient: { get: vi.fn(), update: updateMock } as never,
    debugLog: vi.fn(),
    markError: vi.fn(),
    sendOutboundMessageWithAck: vi.fn(async () => true),
    publishRuntimeState: vi.fn(async () => true),
    emitDeliveryStatus: vi.fn(),
  });

  return { manager, state, updateMock, commandHandler };
}

describe("persistCanvasHtml", () => {
  it("writes to bridgeSlug", async () => {
    const { manager, state, updateMock, commandHandler } = createBridgeManagerHarness();
    state.bridgeSlug = "pub-a";

    const result = await manager.persistCanvasHtml("<h1>hello</h1>");

    expect(result).toEqual({ ok: true, delivered: true });
    expect(updateMock).toHaveBeenCalledWith({ slug: "pub-a", content: "<h1>hello</h1>" });
    expect(commandHandler.bindFromHtml).toHaveBeenCalledWith("<h1>hello</h1>");
  });

  it("fails when bridgeSlug is null", async () => {
    const { manager, updateMock } = createBridgeManagerHarness();

    const result = await manager.persistCanvasHtml("<h1>hello</h1>");

    expect(result).toEqual({ ok: false, error: "No active live session." });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("targets bridgeSlug even when activeSlug differs", async () => {
    const { manager, state, updateMock } = createBridgeManagerHarness();
    state.bridgeSlug = "pub-a";
    state.activeSlug = "pub-b";

    const result = await manager.persistCanvasHtml("<h1>hello</h1>");

    expect(result).toEqual({ ok: true, delivered: true });
    expect(updateMock).toHaveBeenCalledWith({ slug: "pub-a", content: "<h1>hello</h1>" });
  });

  it("reports API errors", async () => {
    const { manager, state, updateMock } = createBridgeManagerHarness();
    state.bridgeSlug = "pub-a";
    updateMock.mockRejectedValue(new Error("network failure"));

    const result = await manager.persistCanvasHtml("<h1>hello</h1>");

    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("network failure") });
  });
});
