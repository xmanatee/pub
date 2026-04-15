import { createFileRoute } from "@tanstack/react-router";
import { TrackerPage } from "~/features/tracker/page";

export const Route = createFileRoute("/tracker")({
  component: TrackerPage,
});
