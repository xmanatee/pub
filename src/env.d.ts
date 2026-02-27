/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CONVEX_URL?: string;
  readonly VITE_E2E_AUTH_BASE_URL?: string;
  readonly VITE_POSTHOG_KEY?: string;
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_SENTRY_RELEASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
