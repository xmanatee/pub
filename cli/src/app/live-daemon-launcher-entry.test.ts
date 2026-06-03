import * as fs from "node:fs";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { spawnMock, unrefMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
  unrefMock: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  spawn: spawnMock,
}));

import { runDaemonLauncherFromEnv } from "./live-daemon-launcher-entry";

describe("runDaemonLauncherFromEnv", () => {
  let originalEnv: NodeJS.ProcessEnv;
  let tempDir: string;

  beforeEach(() => {
    originalEnv = { ...process.env };
    tempDir = fs.mkdtempSync(path.join("/tmp", "pub-daemon-launcher-"));
    spawnMock.mockReturnValue({ pid: 4321, unref: unrefMock });
    unrefMock.mockReset();
    process.env.PUB_DAEMON_LAUNCHER_MODE = "1";
    process.env.PUB_DAEMON_LOG = path.join(tempDir, "agent.log");
    process.env.PUB_DAEMON_INFO = path.join(tempDir, "agent.json");
    process.env.PUB_DAEMON_SOCKET = path.join(tempDir, "daemon.sock");
    process.env.PUB_CLI_VERSION = "0.11.15";
  });

  afterEach(() => {
    process.env = originalEnv;
    spawnMock.mockReset();
    unrefMock.mockReset();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("records the daemon pid before the daemon finishes initializing", () => {
    runDaemonLauncherFromEnv();

    const info = JSON.parse(fs.readFileSync(process.env.PUB_DAEMON_INFO as string, "utf8")) as {
      pid: number;
      socketPath?: string;
      logPath?: string;
      cliVersion?: string;
    };

    expect(info).toEqual({
      pid: 4321,
      socketPath: process.env.PUB_DAEMON_SOCKET,
      logPath: process.env.PUB_DAEMON_LOG,
      cliVersion: "0.11.15",
      launching: true,
      startedAt: expect.any(Number),
    });
    const [command, args, options] = spawnMock.mock.calls[0] ?? [];
    expect(command).toBe(process.execPath);
    expect(args).toEqual([]);
    expect(options).toEqual(
      expect.objectContaining({
        detached: true,
        env: expect.objectContaining({
          PUB_DAEMON_MODE: "1",
        }),
      }),
    );
    expect((options as { env: NodeJS.ProcessEnv }).env).not.toHaveProperty(
      "PUB_DAEMON_LAUNCHER_MODE",
    );
    expect(unrefMock).toHaveBeenCalledOnce();
  });
});
