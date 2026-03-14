import { EventEmitter } from "node:events";
import * as fs from "node:fs";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import type { ChildProcess } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { waitForDaemonReady } from "./daemon-process.js";

function makeStatusResponse(): string {
  return `${JSON.stringify({
    ok: true,
    connected: false,
    signalingConnected: null,
    activeSlug: null,
    uptime: 0,
    channels: [],
    bufferedMessages: 0,
    lastError: null,
    bridgeMode: null,
    bridge: null,
    logPath: null,
  })}\n`;
}

class FakeChild extends EventEmitter {}

describe("waitForDaemonReady", () => {
  const tempDirs: string[] = [];
  const servers: net.Server[] = [];

  afterEach(async () => {
    await Promise.all(
      servers.splice(0).map(
        (server) =>
          new Promise<void>((resolve) => {
            server.close(() => resolve());
          }),
      ),
    );

    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("ignores launcher exit when failOnChildExit is false", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pub-daemon-ready-"));
    tempDirs.push(dir);
    const socketPath = path.join(dir, "daemon.sock");
    const infoPath = path.join(dir, "daemon.json");
    fs.writeFileSync(infoPath, JSON.stringify({ pid: 123 }));

    const server = net.createServer((conn) => {
      let data = "";
      conn.on("data", (chunk) => {
        data += chunk.toString("utf-8");
        if (!data.includes("\n")) return;
        conn.write(makeStatusResponse());
        conn.end();
      });
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(socketPath, () => resolve()));

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
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pub-daemon-exit-"));
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
