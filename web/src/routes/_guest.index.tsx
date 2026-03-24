import { createFileRoute } from "@tanstack/react-router";
import { LandingPage } from "~/features/landing/page/landing-page";

export const Route = createFileRoute("/_guest/")({
  component: LandingPage,
});
