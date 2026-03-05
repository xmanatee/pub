import { createFileRoute } from "@tanstack/react-router";
import { PanelsDebugPage } from "~/devtools/pages/panels-debug-page";
import { requireDevRoute } from "~/devtools/require-dev-route";

export const Route = createFileRoute("/debug/panels")({
  beforeLoad: requireDevRoute,
  component: PanelsDebugPage,
});
