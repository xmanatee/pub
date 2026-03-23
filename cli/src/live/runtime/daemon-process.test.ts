import { EventEmitter } from "node:events";
import * as fs from "node:fs";
import * as path from "node:path";
import type { ChildProcess } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";

const { ipcCallMock } = vi.hoisted(() => ({
  ipcCallMock: vi.fn(),
}));

vi.mock("../transport/ipc.js", () => ({
  ipcCall: ipcCallMock,
}));

import { waitForDaemonReady } from "./daemon-process.js";

function makeStatusResponse(): string {
  return `${JSON.stringify({
    ok: true,
    agentActivity: "idle",
    agentState: "idle",
    connectionState: "idle",
    executorState: "idle",
    signalingConnected: null,
    activeSlug: null,
    uptime: 0,
    channels: [],
    lastError: null,
    bridgeMode: null,
    bridge: null,
    logPath: null,
  })}\n`;
}

class FakeChild extends EventEmitter {}

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join("/tmp", prefix));
}

describe("waitForDaemonReady", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    ipcCallMock.mockReset();
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("ignores launcher exit when failOnChildExit is false", async () => {
    const dir = makeTempDir("pub-daemon-ready-");
    tempDirs.push(dir);
    const socketPath = path.join(dir, "daemon.sock");
    const infoPath = path.join(dir, "daemon.json");
    fs.writeFileSync(infoPath, JSON.stringify({ pid: 123 }));
    ipcCallMock.mockResolvedValue(JSON.parse(makeStatusResponse()) as { ok: boolean });

    const child = new FakeChild() as unknown as ChildProcess;
    setTimeout(() => {
      (child as unknown as FakeChild).emit("exit", 0, null);
    }, 10);

    await expect(
      waitForDaemonReady({
        child,
        infoPath,
        socketPath,
        timeoutMs: 1_000,
        failOnChildExit: false,
      }),
    ).resolves.toEqual({ ok: true });
  });

  it("fails fast when the spawned child exits before readiness by default", async () => {
    const dir = makeTempDir("pub-daemon-exit-");
    tempDirs.push(dir);
    const socketPath = path.join(dir, "daemon.sock");
    const infoPath = path.join(dir, "daemon.json");
    fs.writeFileSync(infoPath, JSON.stringify({ pid: 123 }));

    const child = new FakeChild() as unknown as ChildProcess;
    setTimeout(() => {
      (child as unknown as FakeChild).emit("exit", 7, null);
    }, 10);

    await expect(
      waitForDaemonReady({
        child,
        infoPath,
        socketPath,
        timeoutMs: 1_000,
      }),
    ).resolves.toEqual({ ok: false, reason: "daemon exited with code 7" });
  });
});
