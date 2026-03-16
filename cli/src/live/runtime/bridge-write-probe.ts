import * as fs from "node:fs";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";

interface ProbeRequest {
  method?: unknown;
  params?: unknown;
}

function isPongWriteRequest(req: ProbeRequest): boolean {
  if (req.method !== "write" || !req.params || typeof req.params !== "object") return false;
  const msg = (req.params as { msg?: unknown }).msg;
  if (!msg || typeof msg !== "object") return false;
  const type = (msg as { type?: unknown }).type;
  const data = (msg as { data?: unknown }).data;
  return type === "text" && typeof data === "string" && data.trim().toLowerCase() === "pong";
}

function generateProbeSocketPath(): string {
  const suffix = `${Date.now()}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  const socketDir =
    process.platform !== "win32" && fs.existsSync("/tmp") ? "/tmp" : os.tmpdir();
  return path.join(socketDir, `pub-agent-probe-${suffix}.sock`);
}

function createProbeTimeoutError(label: string, timeoutMs: number): Error {
  return new Error(
    `${label} ping/pong preflight failed: did not perform \`pub write "pong"\` within ${timeoutMs}ms.`,
  );
}

async function waitForPongWrite(params: {
  label: string;
  timeoutMs: number;
  signal: AbortSignal;
  isReceived: () => boolean;
}): Promise<void> {
  while (!params.isReceived()) {
    if (params.signal.aborted) {
      throw createProbeTimeoutError(params.label, params.timeoutMs);
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
}

export async function runAgentWritePongProbe(params: {
  label: string;
  baseEnv: NodeJS.ProcessEnv;
  execute: (probeEnv: NodeJS.ProcessEnv, signal: AbortSignal) => Promise<void>;
  timeoutMs?: number;
}): Promise<void> {
  const timeoutMs = params.timeoutMs ?? 60_000;
  const socketPath = generateProbeSocketPath();
  const abortController = new AbortController();
  let receivedPongWrite = false;
  let serverClosed = false;

  const server = net.createServer((conn) => {
    let data = "";
    conn.on("data", (chunk) => {
      data += chunk.toString("utf-8");
      const newlineIdx = data.indexOf("\n");
      if (newlineIdx === -1) return;

      const line = data.slice(0, newlineIdx);
      data = data.slice(newlineIdx + 1);

      let request: ProbeRequest;
      try {
        request = JSON.parse(line) as ProbeRequest;
      } catch {
        conn.write(`${JSON.stringify({ ok: false, error: "Invalid JSON" })}\n`);
        return;
      }

      if (request.method === "write") {
        if (isPongWriteRequest(request)) {
          receivedPongWrite = true;
        }
        conn.write(`${JSON.stringify({ ok: true, delivered: true })}\n`);
        return;
      }

      conn.write(`${JSON.stringify({ ok: false, error: "Unsupported probe method" })}\n`);
    });
  });

  const cleanup = async () => {
    if (!serverClosed) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      serverClosed = true;
    }
    try {
      fs.unlinkSync(socketPath);
    } catch {
      // best-effort cleanup for tmp socket
    }
  };

  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(socketPath, () => resolve());
    });

    const probeEnv: NodeJS.ProcessEnv = { ...params.baseEnv, PUB_AGENT_SOCKET: socketPath };
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        abortController.abort();
        reject(createProbeTimeoutError(params.label, timeoutMs));
      }, timeoutMs);
    });

    try {
      await Promise.race([
        Promise.all([
          params.execute(probeEnv, abortController.signal),
          waitForPongWrite({
            label: params.label,
            timeoutMs,
            signal: abortController.signal,
            isReceived: () => receivedPongWrite,
          }),
        ]),
        timeoutPromise,
      ]);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  } finally {
    await cleanup();
  }
}
