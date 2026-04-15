/**
 * Browser polyfills for Node globals that gramjs (and its transitive deps)
 * reach for at module-evaluation time. Safe no-op on the server — only the
 * browser branch applies the shims.
 */
import { Buffer } from "buffer";

if (typeof window !== "undefined") {
  const g = window as unknown as {
    Buffer?: typeof Buffer;
    process?: { env: Record<string, string> };
  };
  if (!g.Buffer) g.Buffer = Buffer;
  if (!g.process) g.process = { env: {} };
}
