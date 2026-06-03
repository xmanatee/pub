import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { buildDaemonSpawnStdio } from "../live/runtime/daemon-process.js";

function writeLaunchInfo(params: {
  infoPath: string | undefined;
  pid: number | undefined;
  socketPath: string | undefined;
  logPath: string;
  cliVersion: string | undefined;
}): void {
  if (!params.infoPath || typeof params.pid !== "number") return;
  fs.mkdirSync(path.dirname(params.infoPath), { recursive: true, mode: 0o700 });
  const tmp = `${params.infoPath}.${params.pid}.launch.tmp`;
  fs.writeFileSync(
    tmp,
    `${JSON.stringify({
      pid: params.pid,
      socketPath: params.socketPath,
      logPath: params.logPath,
      cliVersion: params.cliVersion,
      launching: true,
      startedAt: Date.now(),
    })}\n`,
    { mode: 0o600 },
  );
  fs.renameSync(tmp, params.infoPath);
}

export function runDaemonLauncherFromEnv(): void {
  const logPath = process.env.PUB_DAEMON_LOG;
  if (!logPath) {
    console.error("Missing PUB_DAEMON_LOG env var.");
    process.exit(1);
  }

  const daemonEnv: NodeJS.ProcessEnv = {
    ...process.env,
    PUB_DAEMON_MODE: "1",
  };
  delete daemonEnv.PUB_DAEMON_LAUNCHER_MODE;

  const daemonLogFd = fs.openSync(logPath, "a");
  try {
    const child = spawn(process.execPath, [], {
      detached: true,
      stdio: buildDaemonSpawnStdio(daemonLogFd),
      env: daemonEnv,
    });
    writeLaunchInfo({
      infoPath: daemonEnv.PUB_DAEMON_INFO,
      pid: child.pid,
      socketPath: daemonEnv.PUB_DAEMON_SOCKET,
      logPath,
      cliVersion: daemonEnv.PUB_CLI_VERSION,
    });
    child.unref();
  } finally {
    fs.closeSync(daemonLogFd);
  }
}
