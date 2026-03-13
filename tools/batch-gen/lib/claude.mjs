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
    let done = false;
    function finish(ok, exitCode) {
      if (done) return;
      done = true;
      logStream.end();
      activeChild = null;
      resolve({ ok, exitCode });
    }
    child.stdout.pipe(logStream);
    child.stderr.pipe(logStream);
    child.on("close", (code) => finish(code === 0, code ?? 1));
    child.on("error", () => finish(false, 1));
  });
}
