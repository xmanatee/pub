import { createFileRoute } from "@tanstack/react-router";
import { TelegramPage } from "~/features/telegram/page";

export const Route = createFileRoute("/telegram")({
  component: TelegramPage,
});
