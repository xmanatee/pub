import { createFileRoute } from "@tanstack/react-router";
import { InboxPage } from "~/features/inbox/page";

export const Route = createFileRoute("/inbox")({
  component: InboxPage,
});
