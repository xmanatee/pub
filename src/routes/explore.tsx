import { createFileRoute } from "@tanstack/react-router";
import { ExplorePage } from "~/features/explore/page/explore-page";

export const Route = createFileRoute("/explore")({
  component: ExploreRoute,
});

function ExploreRoute() {
  return <ExplorePage />;
}
