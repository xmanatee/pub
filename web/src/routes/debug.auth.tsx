import { createFileRoute } from "@tanstack/react-router";
import { AuthDebugPage } from "~/devtools/pages/auth-debug-page";
import { requireDevRoute } from "~/devtools/require-dev-route";

export const Route = createFileRoute("/debug/auth")({
  beforeLoad: requireDevRoute,
  component: AuthDebugPage,
});
