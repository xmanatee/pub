import { createFileRoute } from "@tanstack/react-router";
import { MailPage } from "~/features/mail/page";

export const Route = createFileRoute("/mail")({
  component: MailPage,
});
