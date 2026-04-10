import { spawn } from "node:child_process";
import * as fs from "node:fs";
import { buildDaemonSpawnStdio } from "../live/runtime/daemon-process.js";

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
    child.unref();
  } finally {
    fs.closeSync(daemonLogFd);
  }
}
