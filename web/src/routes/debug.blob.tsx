import { createFileRoute } from "@tanstack/react-router";
import { BlobDebugPage } from "~/devtools/pages/blob-debug-page";
import { requireDevRoute } from "~/devtools/require-dev-route";

export const Route = createFileRoute("/debug/blob")({
  beforeLoad: requireDevRoute,
  component: BlobDebugPage,
});
