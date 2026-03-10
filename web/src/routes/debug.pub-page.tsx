import { createFileRoute } from "@tanstack/react-router";
import { PubPageDebug } from "~/devtools/pages/pub-page-debug-page";
import { requireDevRoute } from "~/devtools/require-dev-route";

export const Route = createFileRoute("/debug/pub-page")({
  beforeLoad: requireDevRoute,
  component: PubPageDebug,
});
