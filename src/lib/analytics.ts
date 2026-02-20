/**
 * Centralized analytics event definitions and tracking wrapper.
 *
 * All custom PostHog events are defined here as a single source of truth.
 * Components call these typed functions instead of raw posthog.capture().
 */

import * as Sentry from "@sentry/react";
import posthog from "posthog-js";

// ---------------------------------------------------------------------------
// User identity
// ---------------------------------------------------------------------------

export function identifyUser(userId: string, traits?: Record<string, unknown>) {
  posthog.identify(userId, traits);
  Sentry.setUser({ id: userId, ...traits });
}

export function resetIdentity() {
  posthog.reset();
  Sentry.setUser(null);
}

// ---------------------------------------------------------------------------
// Authentication events
// ---------------------------------------------------------------------------

export function trackSignIn(provider: string) {
  posthog.capture("user_signed_in", { provider });
}

export function trackSignOut() {
  posthog.capture("user_signed_out");
}

export function trackSignInStarted(provider: string) {
  posthog.capture("sign_in_started", { provider });
}

// ---------------------------------------------------------------------------
// Publication events
// ---------------------------------------------------------------------------

export function trackPublicationViewed(props: {
  slug: string;
  contentType: string;
  isPublic: boolean;
  isOwner: boolean;
}) {
  posthog.capture("publication_viewed", props);
}

export function trackPublicationCreated(props: {
  slug: string;
  contentType: string;
  isPublic: boolean;
  source: "dashboard" | "api" | "cli";
}) {
  posthog.capture("publication_created", props);
}

export function trackPublicationDeleted(props: { slug: string; contentType: string }) {
  posthog.capture("publication_deleted", props);
}

export function trackVisibilityToggled(props: {
  slug: string;
  newVisibility: "public" | "private";
}) {
  posthog.capture("publication_visibility_toggled", props);
}

export function trackPublicationLinkCopied(props: { slug: string }) {
  posthog.capture("publication_link_copied", props);
}

export function trackPublicationRawViewed(props: { slug: string }) {
  posthog.capture("publication_raw_viewed", props);
}

// ---------------------------------------------------------------------------
// API key events
// ---------------------------------------------------------------------------

export function trackApiKeyCreated(props: { name: string }) {
  posthog.capture("api_key_created", props);
}

export function trackApiKeyDeleted(props: { name: string }) {
  posthog.capture("api_key_deleted", props);
}

export function trackApiKeyCopied() {
  posthog.capture("api_key_copied");
}

// ---------------------------------------------------------------------------
// Dashboard events
// ---------------------------------------------------------------------------

export function trackDashboardTabChanged(props: { tab: "publications" | "keys" }) {
  posthog.capture("dashboard_tab_changed", props);
}

// ---------------------------------------------------------------------------
// Landing page events
// ---------------------------------------------------------------------------

export function trackCtaClicked(props: { cta: string; location: string }) {
  posthog.capture("cta_clicked", props);
}

// ---------------------------------------------------------------------------
// Error tracking (reported to both PostHog and Sentry)
// ---------------------------------------------------------------------------

export function trackError(error: Error, context?: Record<string, unknown>) {
  posthog.capture("client_error", {
    error_message: error.message,
    error_name: error.name,
    ...context,
  });
  Sentry.captureException(error, { extra: context });
}

export function trackMutationError(mutationName: string, error: Error) {
  posthog.capture("mutation_error", {
    mutation: mutationName,
    error_message: error.message,
  });
  Sentry.captureException(error, {
    tags: { mutation: mutationName },
  });
}
