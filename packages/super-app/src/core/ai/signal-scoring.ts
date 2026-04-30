/**
 * Score-based action surfacing. Each signal contributes a fixed weight; an
 * action whose total score crosses `AUTO_SURFACE_THRESHOLD` is rendered
 * inline in the detail view rather than hidden behind the AI menu.
 *
 * Mirrors meridian-workspace's pattern (date/action/reference/question +
 * service-specific scoring) but exposes the table here so unit tests can
 * pin the weights down.
 */
import type { ServiceAction } from "~/core/navigation/registry";

export const AUTO_SURFACE_THRESHOLD = 0.62;

export const SIGNAL_WEIGHTS = {
  date: 0.18,
  action: 0.18,
  reference: 0.1,
  question: 0.12,
  serviceMatch: 0.18,
  serviceAdjacent: 0.08,
} as const;

const DATE_TOKENS = [
  "tomorrow",
  "today",
  "tonight",
  "next week",
  "next month",
  "this week",
  "this month",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
  "morning",
  "afternoon",
  "evening",
  "deadline",
  "by ",
  "due",
  "schedule",
];

const ACTION_TOKENS = [
  "implement",
  "fix",
  "review",
  "build",
  "ship",
  "send",
  "draft",
  "follow up",
  "follow-up",
  "remind",
  "reply",
  "schedule",
  "book",
  "buy",
  "call",
  "email",
  "write",
  "decide",
];

const REFERENCE_TOKENS = [
  "summary",
  "decision",
  "spec",
  "design",
  "doc",
  "minutes",
  "notes",
  "post-mortem",
  "retro",
];

function lc(text: string): string {
  return text.toLowerCase();
}

export function score(excerpt: string, action: ServiceAction, sourceServiceId: string): number {
  const t = lc(excerpt);
  let total = 0;
  if (DATE_TOKENS.some((k) => t.includes(k))) total += SIGNAL_WEIGHTS.date;
  if (ACTION_TOKENS.some((k) => t.includes(k))) total += SIGNAL_WEIGHTS.action;
  if (REFERENCE_TOKENS.some((k) => t.includes(k))) total += SIGNAL_WEIGHTS.reference;
  if (t.includes("?")) total += SIGNAL_WEIGHTS.question;
  if (matchesService(action, sourceServiceId)) total += SIGNAL_WEIGHTS.serviceMatch;
  else if (adjacentService(action, sourceServiceId)) total += SIGNAL_WEIGHTS.serviceAdjacent;
  return total;
}

function matchesService(action: ServiceAction, sourceServiceId: string): boolean {
  if (action === "draft-email" && sourceServiceId === "mail") return true;
  if (action === "create-event" && sourceServiceId === "calendar") return true;
  if (action === "create-task" && sourceServiceId === "tasks") return true;
  if (action === "create-note" && sourceServiceId === "notes") return true;
  if (action === "draft-telegram" && sourceServiceId === "telegram") return true;
  return false;
}

function adjacentService(action: ServiceAction, sourceServiceId: string): boolean {
  if (action === "draft-email" && (sourceServiceId === "telegram" || sourceServiceId === "mail"))
    return true;
  if (action === "create-event" && (sourceServiceId === "mail" || sourceServiceId === "telegram"))
    return true;
  if (action === "create-task") return true;
  if (action === "create-note") return true;
  return false;
}

export interface RankedAction {
  action: ServiceAction;
  score: number;
  surface: boolean;
}

export function rankActions(
  excerpt: string,
  sourceServiceId: string,
  candidates: ServiceAction[],
): RankedAction[] {
  return candidates
    .map((action) => {
      const s = score(excerpt, action, sourceServiceId);
      return { action, score: s, surface: s >= AUTO_SURFACE_THRESHOLD };
    })
    .sort((a, b) => b.score - a.score);
}
