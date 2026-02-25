import posthog from "posthog-js";

let initialized = false;

export function initPostHog() {
  const apiKey = import.meta.env.VITE_POSTHOG_KEY;
  const apiHost = import.meta.env.VITE_POSTHOG_HOST;
  if (!apiKey || initialized) return;

  posthog.init(apiKey, {
    api_host: apiHost || "https://eu.i.posthog.com",
    person_profiles: "identified_only",

    // Autocapture — clicks, form submissions, page views
    autocapture: true,
    capture_pageview: true,
    capture_pageleave: true,

    // Session recording
    session_recording: {
      recordCrossOriginIframes: false,
    },

    // Performance
    loaded: (ph) => {
      // In dev, enable debug mode
      if (import.meta.env.DEV) {
        ph.debug();
      }
    },

    // Privacy: mask all inputs by default
    mask_all_text: false,
    mask_all_element_attributes: false,

    // Bootstrap: don't block rendering
    bootstrap: {},
    persistence: "localStorage+cookie",
  });

  initialized = true;
}

export function getPostHog() {
  return initialized ? posthog : null;
}
