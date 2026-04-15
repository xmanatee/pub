/** Tracker — JSON store lives server-side (`server.ts`); AI routes daemon. */
import type { CommandFunctionSpec } from "~/core/types";

export interface TrackerEntry {
  id: string;
  createdAt: number;
  updatedAt: number | null;
  text: string;
  category: string | null;
}

export const categorize: CommandFunctionSpec = {
  name: "tracker.categorize",
  returns: "json",
  executor: {
    kind: "agent",
    mode: "detached",
    profile: "fast",
    output: "json",
    prompt:
      "Classify this activity into exactly one of: work, exercise, meal, errand, study, rest, other. " +
      'Return ONLY {"category": "..."}.\n\n{{text}}',
  },
};
