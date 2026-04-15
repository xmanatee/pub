import { createFileRoute } from "@tanstack/react-router";
import { BriefingPage } from "~/features/briefing/page";

export const Route = createFileRoute("/")({
  component: BriefingPage,
});
