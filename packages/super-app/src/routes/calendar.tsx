import { createFileRoute } from "@tanstack/react-router";
import { CalendarPage } from "~/features/calendar/page";

export const Route = createFileRoute("/calendar")({
  component: CalendarPage,
});
