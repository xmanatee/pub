import { describe, expect, it } from "vitest";
import { parseDigestThreadsResult } from "./ai-results";

describe("telegram AI result parsers", () => {
  it("parses digest thread items", () => {
    expect(
      parseDigestThreadsResult({
        items: [{ id: "dialog-1", priority: "needs-response", reason: "Direct question" }],
      }),
    ).toEqual({
      items: [{ id: "dialog-1", priority: "needs-response", reason: "Direct question" }],
    });
  });

  it("rejects unknown digest priorities", () => {
    expect(() =>
      parseDigestThreadsResult({
        items: [{ priority: "urgent", reason: "Looks important" }],
      }),
    ).toThrow("ai.digest-threads.items[0].priority must be one of");
  });
});
