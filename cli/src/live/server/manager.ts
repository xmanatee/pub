import { type ChildProcess, spawn } from "node:child_process";
import * as fs from "node:fs";
import { waitForPort } from "./port.js";

const PORT_READY_TIMEOUT_MS = 60_000;

export interface DevServerConfig {
  devCommand: string;
  devPort: number;
}

export interface DevServer {
  process: ChildProcess;
  port: number;
  ready: Promise<void>;
  stop: () => Promise<void>;
}

export function startDevServer(config: DevServerConfig, logPath?: string): DevServer {
  const [cmd, ...args] = config.devCommand.split(/\s+/);
  const logStream = logPath ? fs.createWriteStream(logPath, { flags: "a" }) : null;

  const child = spawn(cmd, args, {
    stdio: ["ignore", logStream ? "pipe" : "inherit", logStream ? "pipe" : "inherit"],
    shell: true,
    env: { ...process.env, PORT: String(config.devPort) },
  });

  if (logStream) {
    child.stdout?.pipe(logStream);
    child.stderr?.pipe(logStream);
  }

  const ready = waitForPort(config.devPort, PORT_READY_TIMEOUT_MS);

  const stop = (): Promise<void> => {
    return new Promise((resolve) => {
      if (child.exitCode !== null) {
        resolve();
        return;
      }

      const forceKillTimer = setTimeout(() => {
        child.kill("SIGKILL");
      }, 5_000);

      child.once("exit", () => {
        clearTimeout(forceKillTimer);
        logStream?.end();
        resolve();
      });

      child.kill("SIGTERM");
    });
  };

  return { process: child, port: config.devPort, ready, stop };
}
