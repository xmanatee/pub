import posthog from "posthog-js";
import "posthog-js/dist/recorder";

let initialized = false;

export function initPostHog() {
  const apiKey = import.meta.env.VITE_POSTHOG_KEY;
  if (!apiKey || initialized) return;

  posthog.init(apiKey, {
    api_host: "/ph",
    ui_host: "https://eu.posthog.com",
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

    // Bundle recorder locally so ad blockers can't block posthog-recorder.js
    disable_external_dependency_loading: true,

    // Bootstrap: don't block rendering
    bootstrap: {},
    persistence: "localStorage+cookie",
  });

  initialized = true;
}
