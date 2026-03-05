import { createFileRoute } from "@tanstack/react-router";
import { PubRoutePage } from "~/features/pub/page/pub-route-page";

export const Route = createFileRoute("/p/$slug")({
  validateSearch: (search: Record<string, unknown>): { autoLive?: "1" } =>
    search.autoLive === "1" ? { autoLive: "1" } : {},
  component: PubRoute,
});

function PubRoute() {
  const { slug } = Route.useParams();
  const { autoLive } = Route.useSearch();
  return <PubRoutePage slug={slug} autoLive={autoLive === "1"} />;
}
