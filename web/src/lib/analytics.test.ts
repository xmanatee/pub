import { describe, expect, it, vi } from "vitest";

/**
 * This test validates the analytics event catalog against docs/posthog-analytics-strategy.md.
 * If you add, remove, or change a tracking function, update both this test and the doc.
 */

const captureSpy = vi.fn();
vi.mock("posthog-js", () => ({
  default: { capture: (...args: unknown[]) => captureSpy(...args) },
}));
vi.mock("@sentry/react", () => ({
  setUser: vi.fn(),
  captureException: vi.fn(),
}));

import {
  identifyUser,
  resetIdentity,
  trackApiKeyCopied,
  trackApiKeyCreated,
  trackApiKeyDeleted,
  trackCtaClicked,
  trackDashboardTabChanged,
  trackError,
  trackPubDeleted,
  trackPubLinkCopied,
  trackPubViewed,
  trackSignIn,
  trackSignInStarted,
  trackSignOut,
  trackVisibilityToggled,
} from "./analytics";

const EVENT_CATALOG: Record<string, { fn: () => void; props?: string[] }> = {
  user_signed_in: { fn: () => trackSignIn("github"), props: ["provider"] },
  user_signed_out: { fn: () => trackSignOut() },
  sign_in_started: { fn: () => trackSignInStarted("google"), props: ["provider"] },
  pub_viewed: {
    fn: () => trackPubViewed({ slug: "s", isPublic: true }),
    props: ["slug", "isPublic"],
  },
  pub_deleted: { fn: () => trackPubDeleted({ slug: "s" }), props: ["slug"] },
  pub_visibility_toggled: {
    fn: () => trackVisibilityToggled({ slug: "s", newVisibility: "public" }),
    props: ["slug", "newVisibility"],
  },
  pub_link_copied: { fn: () => trackPubLinkCopied({ slug: "s" }), props: ["slug"] },
  api_key_created: { fn: () => trackApiKeyCreated({ name: "n" }), props: ["name"] },
  api_key_deleted: { fn: () => trackApiKeyDeleted({ name: "n" }), props: ["name"] },
  api_key_copied: { fn: () => trackApiKeyCopied() },
  dashboard_tab_changed: {
    fn: () => trackDashboardTabChanged({ tab: "pubs" }),
    props: ["tab"],
  },
  cta_clicked: {
    fn: () => trackCtaClicked({ cta: "c", location: "l" }),
    props: ["cta", "location"],
  },
  client_error: {
    fn: () => trackError(new Error("e")),
    props: ["error_message", "error_name"],
  },
};

describe("analytics event catalog", () => {
  for (const [eventName, { fn, props }] of Object.entries(EVENT_CATALOG)) {
    it(`${eventName} — sends correct event name and properties`, () => {
      captureSpy.mockClear();
      fn();
      expect(captureSpy).toHaveBeenCalledOnce();
      const [name, captured] = captureSpy.mock.calls[0];
      expect(name).toBe(eventName);
      if (props) {
        expect(Object.keys(captured).sort()).toEqual([...props].sort());
      } else {
        expect(captured).toBeUndefined();
      }
    });
  }

  it("all exported track* functions are covered", () => {
    const exports = {
      identifyUser,
      resetIdentity,
      trackSignIn,
      trackSignOut,
      trackSignInStarted,
      trackPubViewed,
      trackPubDeleted,
      trackVisibilityToggled,
      trackPubLinkCopied,
      trackApiKeyCreated,
      trackApiKeyDeleted,
      trackApiKeyCopied,
      trackDashboardTabChanged,
      trackCtaClicked,
      trackError,
    };
    const trackFunctions = Object.keys(exports).filter((k) => k.startsWith("track"));
    expect(trackFunctions.length).toBe(Object.keys(EVENT_CATALOG).length);
  });
});
