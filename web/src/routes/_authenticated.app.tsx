import { createFileRoute } from "@tanstack/react-router";
import { TunnelView } from "~/features/tunnel/tunnel-view";

export const Route = createFileRoute("/_authenticated/app")({
  component: TunnelView,
});
