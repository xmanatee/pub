/**
 * Pin the AI prompt registry. Any new prompt must (a) be exported from
 * `core/ai/prompts.ts`, (b) appear in `AI_PROMPT_KEYS`, (c) be wired into
 * `AI_PROMPTS`. This test fails loudly if any of those are out of sync.
 */
import { describe, expect, it } from "vitest";
import { AI_PROMPT_KEYS, AI_PROMPTS } from "~/core/ai/prompts";

describe("ai-prompts", () => {
  it("AI_PROMPTS has an entry for every key in AI_PROMPT_KEYS", () => {
    for (const key of AI_PROMPT_KEYS) {
      expect(AI_PROMPTS, `missing prompt: ${key}`).toHaveProperty(key);
    }
  });

  it("every prompt has a unique stable name", () => {
    const names = Object.values(AI_PROMPTS).map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("every prompt is configured as a detached agent executor", () => {
    for (const key of AI_PROMPT_KEYS) {
      const spec = AI_PROMPTS[key];
      expect(spec.executor?.kind).toBe("agent");
      if (spec.executor?.kind === "agent") {
        expect(spec.executor.mode).toBe("detached");
        expect(spec.executor.prompt.length).toBeGreaterThan(20);
      }
    }
  });
});
