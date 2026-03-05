import { createFileRoute } from "@tanstack/react-router";
import { DashboardDebugPage } from "~/devtools/pages/dashboard-debug-page";
import { requireDevRoute } from "~/devtools/require-dev-route";

export const Route = createFileRoute("/debug/dashboard")({
  beforeLoad: requireDevRoute,
  component: DashboardDebugPage,
});
