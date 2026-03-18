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
    beforeSend(event) {
      const homeDir = process.env.HOME || process.env.USERPROFILE;
      if (!homeDir) return event;
      try {
        const json = JSON.stringify(event);
        const redacted = json.replace(
          new RegExp(homeDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"),
          "~",
        );
        return JSON.parse(redacted);
      } catch {
        return event;
      }
    },
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
