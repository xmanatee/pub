import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { TrackerEntry } from "../results";

const STORE = path.join(os.homedir(), ".pub-super-app", "tracker.json");

async function load(): Promise<TrackerEntry[]> {
  try {
    const raw = await fs.readFile(STORE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as TrackerEntry[]) : [];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

async function save(entries: TrackerEntry[]): Promise<void> {
  await fs.mkdir(path.dirname(STORE), { recursive: true });
  await fs.writeFile(STORE, JSON.stringify(entries, null, 2));
}

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const KEYWORD_CATEGORIES: { keywords: RegExp; category: string }[] = [
  {
    keywords: /\b(walk|run|gym|exercise|yoga|workout|stretch|swim|bike|cycling)\b/i,
    category: "exercise",
  },
  {
    keywords: /\b(meal|breakfast|lunch|dinner|snack|coffee|tea|drink|ate|eat)\b/i,
    category: "meal",
  },
  {
    keywords: /\b(meeting|standup|email|call|review|ship|deploy|debug|refactor|code|pr|commit)\b/i,
    category: "work",
  },
  { keywords: /\b(read|book|paper|article|study|learn|course)\b/i, category: "study" },
  { keywords: /\b(sleep|nap|rest|break|relax|meditate)\b/i, category: "rest" },
  {
    keywords: /\b(buy|shop|grocery|errand|laundry|clean|chore|pickup|drop ?off)\b/i,
    category: "errand",
  },
];

function autoCategorize(text: string): string | null {
  for (const { keywords, category } of KEYWORD_CATEGORIES) {
    if (keywords.test(text)) return category;
  }
  return null;
}

export async function list(): Promise<{ entries: TrackerEntry[] }> {
  const entries = await load();
  entries.sort((a, b) => b.ts - a.ts);
  return { entries };
}

export async function add(params: {
  text: string;
  category?: string;
  parse?: boolean;
}): Promise<{ entry: TrackerEntry }> {
  const text = (params.text ?? "").trim();
  if (!text) throw new Error("text is required");
  const entries = await load();
  const entry: TrackerEntry = {
    id: uid(),
    ts: Date.now(),
    text,
    category: params.category ?? (params.parse !== false ? autoCategorize(text) : null),
  };
  entries.push(entry);
  await save(entries);
  return { entry };
}

export async function del(params: { id: string }): Promise<{ id: string }> {
  const entries = await load();
  const next = entries.filter((e) => e.id !== params.id);
  await save(next);
  return { id: params.id };
}
