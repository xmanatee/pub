import { createFileRoute } from "@tanstack/react-router";
import { GuestLayout } from "~/features/auth/page/guest-layout";
import { requireGuest } from "~/lib/route-guards";

export const Route = createFileRoute("/_guest")({
  beforeLoad: ({ context }) => requireGuest(context.auth),
  component: GuestLayout,
});
