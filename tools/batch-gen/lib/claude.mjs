import { spawn } from "child_process";
import { createWriteStream } from "fs";

let activeChild = null;

export function killActiveChild() {
  if (!activeChild) return;
  const child = activeChild;
  activeChild = null;
  child.kill("SIGTERM");
}

export function runClaude(ctx, { prompt, cwd, logFile }) {
  return new Promise((resolve) => {
    const logStream = createWriteStream(logFile);
    const child = spawn(
      "claude",
      ["-p", prompt, "--model", ctx.model, "--dangerously-skip-permissions"],
      {
        cwd,
        env: { ...process.env, CLAUDECODE: undefined },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    activeChild = child;
    child.stdout.pipe(logStream);
    child.stderr.pipe(logStream);
    child.on("close", (code) => {
      logStream.end();
      activeChild = null;
      resolve({ ok: code === 0, exitCode: code ?? 1 });
    });
    child.on("error", (err) => {
      logStream.end();
      activeChild = null;
      resolve({ ok: false, exitCode: 1 });
    });
  });
}
