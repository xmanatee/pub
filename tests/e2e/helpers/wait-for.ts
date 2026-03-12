interface WaitOptions {
  timeout?: number;
  interval?: number;
}

export async function waitForUrl(url: string, opts: WaitOptions = {}): Promise<void> {
  const { timeout = 30_000, interval = 1_000 } = opts;
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error(`Timed out waiting for ${url} after ${timeout}ms`);
}

export async function waitFor(fn: () => Promise<boolean>, opts: WaitOptions = {}): Promise<void> {
  const { timeout = 30_000, interval = 1_000 } = opts;
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error(`Condition not met within ${timeout}ms`);
}
