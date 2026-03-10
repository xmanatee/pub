import type { BrowserBridge } from "./webrtc-browser";

export async function ensureChannelReady(
  bridge: BrowserBridge,
  channel: string,
  timeoutMs = 5000,
): Promise<boolean> {
  if (bridge.isChannelOpen(channel)) return true;
  const dc = bridge.openChannel(channel);
  if (!dc) {
    console.warn(`Failed to open data channel "${channel}"`);
    return false;
  }
  if (dc.readyState === "open") return true;
  return await new Promise<boolean>((resolve) => {
    let settled = false;
    const done = (value: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(value);
    };
    const timeout = setTimeout(() => {
      console.warn(`Data channel "${channel}" did not open within ${timeoutMs}ms`);
      done(false);
    }, timeoutMs);
    dc.addEventListener("open", () => done(true), { once: true });
    dc.addEventListener(
      "close",
      () => {
        console.warn(`Data channel "${channel}" closed before opening`);
        done(false);
      },
      { once: true },
    );
  });
}
