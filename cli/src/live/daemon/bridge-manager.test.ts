import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createBridgeManager } from "./bridge-manager.js";
import { createDaemonState } from "./state.js";

const tempDirs: string[] = [];
const originalPubHome = process.env.PUB_HOME;

afterEach(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tempDirs.length = 0;
  process.env.PUB_HOME = originalPubHome;
  if (!originalPubHome) delete process.env.PUB_HOME;
});

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pub-bridge-manager-"));
  tempDirs.push(dir);
  return dir;
}

function createBridgeManagerHarness() {
  process.env.PUB_HOME = makeTempDir();
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

function setActivePubSession(
  state: ReturnType<typeof createDaemonState>,
  overrides: { slug?: string; workspaceCanvasDir?: string } = {},
): void {
  state.activeSession = {
    kind: "pub",
    slug: overrides.slug ?? "pub-a",
    pubId: "pub-1",
    liveSessionId: "session-1",
    workspaceCanvasDir: overrides.workspaceCanvasDir ?? makeTempDir(),
    attachmentDir: makeTempDir(),
    artifactsDir: makeTempDir(),
  };
}

describe("persistCanvasHtml", () => {
  it("writes to the active pub session's slug", async () => {
    const { manager, state, updateMock, commandHandler } = createBridgeManagerHarness();
    const workspaceDir = makeTempDir();
    setActivePubSession(state, { slug: "pub-a", workspaceCanvasDir: workspaceDir });
    fs.mkdirSync(path.join(workspaceDir, "assets"), { recursive: true });
    fs.writeFileSync(path.join(workspaceDir, "assets", "app.js"), "console.log('ok');");

    const result = await manager.persistCanvasHtml("<h1>hello</h1>");

    expect(result).toEqual({ ok: true, delivered: true });
    expect(updateMock).toHaveBeenCalledWith({
      slug: "pub-a",
      files: {
        "assets/app.js": "console.log('ok');",
        "index.html": "<h1>hello</h1>",
      },
    });
    expect(commandHandler.bindFromHtml).toHaveBeenCalledWith("<h1>hello</h1>");
  });

  it("fails when there is no active session", async () => {
    const { manager, updateMock } = createBridgeManagerHarness();

    const result = await manager.persistCanvasHtml("<h1>hello</h1>");

    expect(result).toEqual({ ok: false, error: "No active live session." });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("targets the active pub session even when signalingSlug has moved on", async () => {
    const { manager, state, updateMock } = createBridgeManagerHarness();
    setActivePubSession(state, { slug: "pub-a" });
    state.signalingSlug = "pub-b";

    const result = await manager.persistCanvasHtml("<h1>hello</h1>");

    expect(result).toEqual({ ok: true, delivered: true });
    expect(updateMock).toHaveBeenCalledWith({
      slug: "pub-a",
      files: { "index.html": "<h1>hello</h1>" },
    });
  });

  it("rejects canvas writes on tunnel sessions", async () => {
    const { manager, state, updateMock } = createBridgeManagerHarness();
    state.activeSession = {
      kind: "tunnel",
      workspaceCanvasDir: makeTempDir(),
      attachmentDir: makeTempDir(),
      artifactsDir: makeTempDir(),
    };

    const result = await manager.persistCanvasHtml("<h1>hello</h1>");

    expect(result).toMatchObject({
      ok: false,
      error: expect.stringContaining("only supported in pub sessions"),
    });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("reports API errors", async () => {
    const { manager, state, updateMock } = createBridgeManagerHarness();
    setActivePubSession(state, { slug: "pub-a" });
    updateMock.mockRejectedValue(new Error("network failure"));

    const result = await manager.persistCanvasHtml("<h1>hello</h1>");

    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("network failure") });
  });
});
