import * as Sentry from "@sentry/react";
import { isTelemetryEnabled } from "./telemetry";

export function initSentry(router?: { history: unknown }) {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;
  if (!isTelemetryEnabled()) return;

  const tracingIntegration = router
    ? Sentry.tanstackRouterBrowserTracingIntegration(router)
    : Sentry.browserTracingIntegration();

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_SENTRY_RELEASE || undefined,

    integrations: [tracingIntegration, Sentry.replayIntegration()],

    tracesSampleRate: import.meta.env.PROD ? 0.2 : 1.0,

    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,

    tracePropagationTargets: [
      "localhost",
      /^https:\/\/.*\.convex\.cloud/,
      /^https:\/\/.*\.convex\.site/,
    ],

    sendDefaultPii: false,

    beforeSend(event) {
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
