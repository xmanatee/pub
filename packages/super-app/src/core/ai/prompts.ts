/**
 * AI prompt registry. Every agent prompt the super-app uses lives here, as a
 * `CommandFunctionSpec`. Features import these, never write their own. This
 * is the single source of truth for "what AI capabilities exist" — the
 * registry test in `__tests__/ai-prompts.test.ts` enforces that every key
 * declared in `AI_PROMPT_KEYS` has a matching export.
 *
 * Naming convention: `ai.<verb>` — `ai.summarize`, `ai.translate`, etc.
 * Every prompt's executor uses `mode: "detached"` so they run alongside the
 * user's main agent session.
 */
import type { CommandFunctionSpec } from "~/core/types";

function textPrompt(
  name: string,
  prompt: string,
  profile: "fast" | "default" | "deep" = "fast",
): CommandFunctionSpec {
  return {
    name: `ai.${name}`,
    returns: "text",
    executor: { kind: "agent", mode: "detached", profile, output: "text", prompt },
  };
}

function jsonPrompt(
  name: string,
  prompt: string,
  profile: "fast" | "default" | "deep" = "fast",
): CommandFunctionSpec {
  return {
    name: `ai.${name}`,
    returns: "json",
    executor: { kind: "agent", mode: "detached", profile, output: "json", prompt },
  };
}

// --------- Free-form text returns ---------

export const summarize = textPrompt(
  "summarize",
  "Summarize the following content. Be concrete: extract key points, action items, and open questions if any are present. " +
    "Use short paragraphs, no headers, under 120 words.\n\n{{text}}",
);

export const translate = textPrompt(
  "translate",
  "Translate to {{lang}}. Preserve tone, formatting, and any references. Return only the translation.\n\n{{text}}",
);

export const explain = textPrompt(
  "explain",
  "Briefly explain what this means, including any subtext, sarcasm, tone, or cultural context if present. " +
    "1-3 sentences. No preamble.\n\n{{text}}",
);

export const draftReply = textPrompt(
  "draft-reply",
  "Draft a short reply that matches the language and tone of the original message. " +
    "Be natural; under 30 words. No preamble.\n\nOriginal:\n{{text}}\n\nIntent (optional): {{intent}}",
);

export const retone = textPrompt(
  "retone",
  "Rewrite this in a {{tone}} tone, preserving meaning, intent, and language. Return only the rewritten text.\n\n{{text}}",
);

export const qaDocument = textPrompt(
  "qa-document",
  "Answer the question using only the document below. Be concise; if the document does not say, say so explicitly.\n\nDocument:\n{{document}}\n\nQuestion: {{question}}",
);

export const briefMe = textPrompt(
  "brief-me",
  "Write a warm, concise 3-4 sentence morning briefing from these facts. No bullet lists, no headers.\n\n{{context}}",
);

export const joke = textPrompt(
  "joke",
  "Tell one short, clever, PG-rated joke. Just the joke, no preamble.",
);

export const quote = textPrompt(
  "quote",
  "Return one short motivational quote (attributed if well-known) under 30 words. No preamble.",
);

// --------- JSON returns ---------

export const suggestReplies = jsonPrompt(
  "suggest-replies",
  "Generate 1-3 short, natural quick-reply options for this conversation. " +
    'Return JSON: {"replies": ["...", "..."]}.\n\n{{text}}',
);

export const digestThreads = jsonPrompt(
  "digest-threads",
  'Triage these messages by urgency. Return JSON: {"items": [{"id": "...", "priority": "needs-response"|"worth-reading"|"low", "reason": "..."}]}.\n\n{{messages}}',
  "default",
);

export const categorize = jsonPrompt(
  "categorize",
  'Classify this entry into exactly one of: {{categories}}. Return ONLY {"category": "..."}. \n\n{{text}}',
);

export const analyzeTask = jsonPrompt(
  "analyze-task",
  "Analyze this task. Return JSON with these fields:\n" +
    '  priority: "urgent" | "high" | "medium" | "low"\n' +
    '  category: one of "work","personal","health","finance","shopping","learning","social","home","other"\n' +
    '  estimatedTime: "15m" | "30m" | "1h" | "2h" | "3h" | "1d"\n' +
    "  subtasks: array of 0-4 specific action steps; only for genuinely multi-step work, no generic 'research'\n" +
    '  recurrence: null or one of "daily","weekdays","weekly","biweekly","monthly"\n' +
    "  note: optional short context (under 12 words) linking to related tasks\n\n" +
    "Existing high-priority tasks (for context):\n{{context}}\n\n" +
    "New task: {{text}}",
  "default",
);

export const triageTasks = jsonPrompt(
  "triage-tasks",
  "Holistically review these active tasks and suggest priority changes only when the rebalance is clearly correct. " +
    'Return JSON: {"changes": [{"id": "...", "priority": "...", "reason": "..."}]}. ' +
    "Be conservative; if nothing should change, return an empty array.\n\n{{tasks}}",
  "default",
);

export const processTaskComment = jsonPrompt(
  "process-task-comment",
  'A user commented on a task. Return JSON: {"reply": "1-2 sentence response", "patch": {"priority"?, "category"?, "estimatedTime"?, "recurrence"?, "subtasks"?, "note"?}}. ' +
    "Only include fields in patch that should change.\n\n" +
    "Task:\n{{task}}\n\nComment: {{comment}}",
  "default",
);

export const composeEmail = jsonPrompt(
  "compose-email",
  'Draft an email based on the context. Return JSON: {"to": "...", "subject": "...", "body": "..."}. ' +
    "If `to` cannot be inferred, use empty string. Body must be plain text.\n\n{{context}}",
  "default",
);

export const composeEvent = jsonPrompt(
  "compose-event",
  'Draft a calendar event based on the context. Return JSON: {"summary", "description", "startDate" (RFC3339), "endDate" (RFC3339), "location"}. ' +
    "Default to 1 hour duration starting at the next reasonable time. Use the user's local time zone.\n\n{{context}}",
  "default",
);

export const composeTask = jsonPrompt(
  "compose-task",
  'Draft a task based on the context. Return JSON: {"title", "priority", "category", "estimatedTime", "subtasks", "note", "recurrence"} ' +
    "with the same field shapes as `analyze-task`. \n\n{{context}}",
  "default",
);

export const composeNote = jsonPrompt(
  "compose-note",
  'Draft a note based on the context. Return JSON: {"title": "...", "body": "..." }. Body should be plain text or markdown.\n\n{{context}}',
);

// --------- Registry guard (used by tests) ---------

export const AI_PROMPT_KEYS = [
  "summarize",
  "translate",
  "explain",
  "draftReply",
  "retone",
  "qaDocument",
  "briefMe",
  "joke",
  "quote",
  "suggestReplies",
  "digestThreads",
  "categorize",
  "analyzeTask",
  "triageTasks",
  "processTaskComment",
  "composeEmail",
  "composeEvent",
  "composeTask",
  "composeNote",
] as const;

export type AiPromptKey = (typeof AI_PROMPT_KEYS)[number];

export const AI_PROMPTS: Record<AiPromptKey, CommandFunctionSpec> = {
  summarize,
  translate,
  explain,
  draftReply,
  retone,
  qaDocument,
  briefMe,
  joke,
  quote,
  suggestReplies,
  digestThreads,
  categorize,
  analyzeTask,
  triageTasks,
  processTaskComment,
  composeEmail,
  composeEvent,
  composeTask,
  composeNote,
};
