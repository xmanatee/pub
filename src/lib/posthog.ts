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
    // Bundled via import above; prevents ad-blocker-catchable separate fetch
    disable_external_dependency_loading: true,
    loaded: (ph) => {
      if (import.meta.env.DEV) ph.debug();
    },
  });

  initialized = true;
}
