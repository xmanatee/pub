const POLL_INTERVAL_MS = 500;

export async function waitForPort(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const ready = await isPortReady(port);
    if (ready) return;
    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(`Port ${port} did not become ready within ${timeoutMs}ms`);
}

async function isPortReady(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://localhost:${port}/`, {
      method: "HEAD",
      signal: AbortSignal.timeout(2000),
    });
    return response.ok || response.status < 500;
  } catch {
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
