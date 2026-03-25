import { createFileRoute } from "@tanstack/react-router";
import { OnboardingDebugPage } from "~/devtools/pages/onboarding-debug-page";
import { requireDevRoute } from "~/devtools/require-dev-route";

export const Route = createFileRoute("/debug/onboarding")({
  beforeLoad: requireDevRoute,
  component: OnboardingDebugPage,
});
