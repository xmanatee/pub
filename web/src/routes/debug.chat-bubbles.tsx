import { createFileRoute } from "@tanstack/react-router";
import { ChatBubblesDebugPage } from "~/devtools/pages/chat-bubbles-debug-page";
import { requireDevRoute } from "~/devtools/require-dev-route";

export const Route = createFileRoute("/debug/chat-bubbles")({
  beforeLoad: requireDevRoute,
  component: ChatBubblesDebugPage,
});
