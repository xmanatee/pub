import { createFileRoute } from "@tanstack/react-router";
import { PubsPage } from "~/features/pubs/page/pubs-page";

export const Route = createFileRoute("/_authenticated/pubs")({
  component: PubsPage,
});
