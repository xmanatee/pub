import { describe, expect, it } from "vitest";
import { buildPubPatch, liveConflictsWithRequest, liveMatchesRequest } from "./pubs";

describe("update patch construction", () => {
  it("includes only provided fields plus updatedAt", () => {
    const patch = buildPubPatch({ content: "new" });
    expect(patch.content).toBe("new");
    expect(patch).toHaveProperty("updatedAt");
    expect(patch).not.toHaveProperty("title");
    expect(patch).not.toHaveProperty("slug");
  });

  it("clears previewHtml when content changes", () => {
    const patch = buildPubPatch({ content: "new" });
    expect(patch.previewHtml).toBeUndefined();
    expect(patch).toHaveProperty("previewHtml");
  });

  it("does not clear previewHtml when only title changes", () => {
    const patch = buildPubPatch({ title: "new title" });
    expect(patch).not.toHaveProperty("previewHtml");
  });

  it("includes all fields when all provided", () => {
    const patch = buildPubPatch({
      content: "c",
      title: "t",
      isPublic: true,
      slug: "s",
    });
    expect(Object.keys(patch).sort()).toEqual(
      ["content", "isPublic", "previewHtml", "slug", "title", "updatedAt"].sort(),
    );
  });

  it("includes slug for rename", () => {
    const patch = buildPubPatch({ slug: "new-slug" });
    expect(patch.slug).toBe("new-slug");
  });
});

describe("liveConflictsWithRequest", () => {
  it("treats the same slug as conflicting even for another agent", () => {
    expect(
      liveConflictsWithRequest(
        { slug: "demo", targetPresenceId: "agent-a" },
        { slug: "demo", targetPresenceId: "agent-b" },
      ),
    ).toBe(true);
  });

  it("treats the same target agent as conflicting across slugs", () => {
    expect(
      liveConflictsWithRequest(
        { slug: "alpha", targetPresenceId: "agent-a" },
        { slug: "beta", targetPresenceId: "agent-a" },
      ),
    ).toBe(true);
  });

  it("allows different slug and different agent", () => {
    expect(
      liveConflictsWithRequest(
        { slug: "alpha", targetPresenceId: "agent-a" },
        { slug: "beta", targetPresenceId: "agent-b" },
      ),
    ).toBe(false);
  });

  it("allows untargeted live when slug and target agent differ", () => {
    expect(
      liveConflictsWithRequest(
        { slug: "untargeted" },
        { slug: "fresh", targetPresenceId: "agent-a" },
      ),
    ).toBe(false);
  });
});

describe("liveMatchesRequest", () => {
  it("treats the same slug, target agent, and browser session as the same logical live", () => {
    expect(
      liveMatchesRequest(
        {
          slug: "demo",
          targetPresenceId: "agent-a",
          browserSessionId: "session-1",
        },
        {
          slug: "demo",
          targetPresenceId: "agent-a",
          browserSessionId: "session-1",
        },
      ),
    ).toBe(true);
  });

  it("does not match when the browser session changes", () => {
    expect(
      liveMatchesRequest(
        {
          slug: "demo",
          targetPresenceId: "agent-a",
          browserSessionId: "session-1",
        },
        {
          slug: "demo",
          targetPresenceId: "agent-a",
          browserSessionId: "session-2",
        },
      ),
    ).toBe(false);
  });

  it("does not match when the target agent changes", () => {
    expect(
      liveMatchesRequest(
        {
          slug: "demo",
          targetPresenceId: "agent-a",
          browserSessionId: "session-1",
        },
        {
          slug: "demo",
          targetPresenceId: "agent-b",
          browserSessionId: "session-1",
        },
      ),
    ).toBe(false);
  });
});
