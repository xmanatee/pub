import * as Sentry from "@sentry/node";

let initialized = false;

export function initSentryCli(opts: { dsn: string; version?: string }): void {
  if (initialized) return;

  Sentry.init({
    dsn: opts.dsn,
    release: opts.version ? `pub-cli@${opts.version}` : undefined,
    tracesSampleRate: 1.0,
    sendDefaultPii: false,
    tracePropagationTargets: [/^https:\/\/.*\.convex\.site/],
  });

  initialized = true;
}

export async function flushSentry(timeoutMs = 2000): Promise<void> {
  if (!initialized) return;
  await Sentry.flush(timeoutMs);
}

export async function closeSentry(timeoutMs = 2000): Promise<void> {
  if (!initialized) return;
  await Sentry.close(timeoutMs);
}

export { Sentry };
