import * as fs from "node:fs";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const { DaemonUnavailableErrorMock, ipcCallMock } = vi.hoisted(() => ({
  DaemonUnavailableErrorMock: class DaemonUnavailableError extends Error {},
  ipcCallMock: vi.fn(),
}));

vi.mock("../transport/ipc.js", () => ({
  DaemonUnavailableError: DaemonUnavailableErrorMock,
  ipcCall: ipcCallMock,
}));

import { prepareDaemonSocketForListen } from "./socket.js";

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join("/tmp", prefix));
}

describe("prepareDaemonSocketForListen", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
    ipcCallMock.mockReset();
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("removes an unavailable stale socket even when launcher info points at a live process", async () => {
    const dir = makeTempDir("pub-daemon-socket-");
    tempDirs.push(dir);
    const socketPath = path.join(dir, "daemon.sock");
    const infoPath = path.join(dir, "agent.json");
    fs.writeFileSync(socketPath, "");
    fs.writeFileSync(infoPath, JSON.stringify({ pid: process.pid, launching: true }));
    ipcCallMock.mockRejectedValue(new DaemonUnavailableErrorMock("Daemon not running."));

    await expect(
      prepareDaemonSocketForListen({
        socketPath,
        debugLog: () => {},
      }),
    ).resolves.toBeUndefined();

    expect(fs.existsSync(socketPath)).toBe(false);
  });

  it("keeps a responsive daemon socket and reports the daemon as already running", async () => {
    const dir = makeTempDir("pub-daemon-socket-live-");
    tempDirs.push(dir);
    const socketPath = path.join(dir, "daemon.sock");
    fs.writeFileSync(socketPath, "");
    ipcCallMock.mockResolvedValue({ ok: true });

    await expect(
      prepareDaemonSocketForListen({
        socketPath,
        debugLog: () => {},
      }),
    ).rejects.toThrow(new RegExp(`^Daemon already running \\(socket: ${socketPath}\\)`));

    expect(fs.existsSync(socketPath)).toBe(true);
  });
});
