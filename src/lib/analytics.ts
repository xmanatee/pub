import * as Sentry from "@sentry/react";
import posthog from "posthog-js";

export function identifyUser(userId: string, traits?: Record<string, unknown>) {
  posthog.identify(userId, traits);
  Sentry.setUser({ id: userId, ...traits });
}

export function resetIdentity() {
  posthog.reset();
  Sentry.setUser(null);
}

export function trackSignIn(provider: string) {
  posthog.capture("user_signed_in", { provider });
}

export function trackSignOut() {
  posthog.capture("user_signed_out");
}

export function trackSignInStarted(provider: string) {
  posthog.capture("sign_in_started", { provider });
}

export function trackPubViewed(props: { slug: string; isPublic: boolean }) {
  posthog.capture("pub_viewed", props);
}

export function trackPubDeleted(props: { slug: string }) {
  posthog.capture("pub_deleted", props);
}

export function trackVisibilityToggled(props: {
  slug: string;
  newVisibility: "public" | "private";
}) {
  posthog.capture("pub_visibility_toggled", props);
}

export function trackPubLinkCopied(props: { slug: string }) {
  posthog.capture("pub_link_copied", props);
}

export function trackApiKeyCreated(props: { name: string }) {
  posthog.capture("api_key_created", props);
}

export function trackApiKeyDeleted(props: { name: string }) {
  posthog.capture("api_key_deleted", props);
}

export function trackApiKeyCopied() {
  posthog.capture("api_key_copied");
}

export function trackDashboardTabChanged(props: { tab: "pubs" | "keys" | "account" }) {
  posthog.capture("dashboard_tab_changed", props);
}

export function trackCtaClicked(props: { cta: string; location: string }) {
  posthog.capture("cta_clicked", props);
}

export function trackError(error: Error, context?: Record<string, unknown>) {
  posthog.capture("client_error", {
    error_message: error.message,
    error_name: error.name,
    ...context,
  });
  Sentry.captureException(error, { extra: context });
}
