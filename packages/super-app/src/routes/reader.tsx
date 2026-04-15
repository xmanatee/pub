import { createFileRoute } from "@tanstack/react-router";
import { ReaderPage } from "~/features/reader/page";

export const Route = createFileRoute("/reader")({
  component: ReaderPage,
});
