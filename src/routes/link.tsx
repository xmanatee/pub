import { createFileRoute } from "@tanstack/react-router";
import { LinkPage } from "~/features/auth/page/link-page";

export const Route = createFileRoute("/link")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: (search.token as string) ?? "",
  }),
  component: LinkRoute,
});

function LinkRoute() {
  const { token } = Route.useSearch();
  return <LinkPage token={token} />;
}
