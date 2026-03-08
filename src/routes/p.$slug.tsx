import { createFileRoute } from "@tanstack/react-router";
import { PubRoutePage } from "~/features/pub/page/pub-route-page";

export const Route = createFileRoute("/p/$slug")({
  component: PubRoute,
});

function PubRoute() {
  const { slug } = Route.useParams();
  return <PubRoutePage slug={slug} />;
}
