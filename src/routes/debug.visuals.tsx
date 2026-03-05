import { createFileRoute } from "@tanstack/react-router";
import { VisualsDebugPage } from "~/devtools/pages/visuals-debug-page";
import { requireDevRoute } from "~/devtools/require-dev-route";

export const Route = createFileRoute("/debug/visuals")({
  beforeLoad: requireDevRoute,
  component: VisualsDebugPage,
});
