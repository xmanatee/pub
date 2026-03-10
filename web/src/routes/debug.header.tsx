import { createFileRoute } from "@tanstack/react-router";
import { HeaderDebugPage } from "~/devtools/pages/header-debug-page";
import { requireDevRoute } from "~/devtools/require-dev-route";

export const Route = createFileRoute("/debug/header")({
  beforeLoad: requireDevRoute,
  component: HeaderDebugPage,
});
