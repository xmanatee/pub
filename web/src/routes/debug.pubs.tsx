import { createFileRoute } from "@tanstack/react-router";
import { PubsDebugPage } from "~/devtools/pages/pubs-debug-page";
import { requireDevRoute } from "~/devtools/require-dev-route";

export const Route = createFileRoute("/debug/pubs")({
  beforeLoad: requireDevRoute,
  component: PubsDebugPage,
});
