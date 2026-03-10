import { spawn } from "node:child_process";

export async function executeProcessCommand(params: {
  command: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs: number;
  maxOutputBytes: number;
  signal: AbortSignal;
}): Promise<{ stdout: string; stderr: string }> {
  return await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(params.command, params.args, {
      cwd: params.cwd,
      env: { ...process.env, ...(params.env ?? {}) },
      signal: params.signal,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      fn();
    };
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      finish(() => reject(new Error(`Command timed out after ${params.timeoutMs}ms`)));
    }, params.timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      if (settled) return;
      stdout += chunk.toString("utf-8");
      if (stdout.length > params.maxOutputBytes) {
        child.kill("SIGTERM");
        finish(() => reject(new Error(`stdout exceeded ${params.maxOutputBytes} bytes`)));
      }
    });

    child.stderr.on("data", (chunk: Buffer) => {
      if (settled) return;
      stderr += chunk.toString("utf-8");
      if (stderr.length > params.maxOutputBytes) {
        child.kill("SIGTERM");
        finish(() => reject(new Error(`stderr exceeded ${params.maxOutputBytes} bytes`)));
      }
    });

    child.on("error", (error) => {
      finish(() => reject(error));
    });

    child.on("close", (code) => {
      if (code === 0) {
        finish(() => resolve({ stdout, stderr }));
        return;
      }
      const detail = stderr.trim().length > 0 ? stderr.trim() : `exit code ${code}`;
      finish(() => reject(new Error(detail)));
    });
  });
}

export async function executeShellCommand(params: {
  script: string;
  shell?: string;
  cwd?: string;
  timeoutMs: number;
  maxOutputBytes: number;
  signal: AbortSignal;
}): Promise<{ stdout: string; stderr: string }> {
  const shell = params.shell?.trim() || "/bin/sh";
  return await executeProcessCommand({
    command: shell,
    args: ["-lc", params.script],
    cwd: params.cwd,
    timeoutMs: params.timeoutMs,
    maxOutputBytes: params.maxOutputBytes,
    signal: params.signal,
  });
}
