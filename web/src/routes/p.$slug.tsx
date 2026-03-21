import { createFileRoute } from "@tanstack/react-router";
import { PubRoutePage } from "~/features/pub/page/pub-route-page";

export const Route = createFileRoute("/p/$slug")({
  component: PubRoute,
  validateSearch: (search: Record<string, unknown>): { source?: boolean } => ({
    source: search.source === true || search.source === "true" || undefined,
  }),
});

function PubRoute() {
  const { slug } = Route.useParams();
  const { source } = Route.useSearch();
  return <PubRoutePage slug={slug} showSource={source} />;
}
