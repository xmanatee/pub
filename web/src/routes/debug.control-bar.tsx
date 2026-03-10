import { createFileRoute } from "@tanstack/react-router";
import { ControlBarDebugPage } from "~/devtools/pages/control-bar-debug-page";
import { requireDevRoute } from "~/devtools/require-dev-route";

export const Route = createFileRoute("/debug/control-bar")({
  beforeLoad: requireDevRoute,
  component: ControlBarDebugPage,
});
