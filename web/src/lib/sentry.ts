import * as Sentry from "@sentry/react";

export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_SENTRY_RELEASE || undefined,

    integrations: [Sentry.browserTracingIntegration(), Sentry.replayIntegration()],

    // Performance: sample 100% in dev, 20% in production
    tracesSampleRate: import.meta.env.PROD ? 0.2 : 1.0,

    // Session Replay: 10% of sessions, 100% of sessions with errors
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,

    // Only trace requests to our own backend
    tracePropagationTargets: [
      "localhost",
      /^https:\/\/.*\.convex\.cloud/,
      /^https:\/\/.*\.convex\.site/,
    ],

    // Don't send PII by default
    sendDefaultPii: false,

    beforeSend(event) {
      // Scrub any API keys from breadcrumbs
      if (event.breadcrumbs) {
        for (const breadcrumb of event.breadcrumbs) {
          if (breadcrumb.data?.url) {
            const url = breadcrumb.data.url as string;
            if (url.includes("key=")) {
              breadcrumb.data.url = url.replace(/key=[^&]+/, "key=[REDACTED]");
            }
          }
        }
      }
      return event;
    },
  });
}
