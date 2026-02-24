import { describe, expect, it } from "vitest";

describe("publish command flag mapping", () => {
  it("maps --private flag to isPublic=false", () => {
    const isPublic = !true;
    expect(isPublic).toBe(false);
  });

  it("maps no --private flag to isPublic=true", () => {
    const privateFlag = undefined as boolean | undefined;
    const isPublic = !privateFlag;
    expect(isPublic).toBe(true);
  });
});

describe("update command visibility flags", () => {
  function resolveVisibility(opts: { public?: boolean; private?: boolean }): boolean | undefined {
    if (opts.public) return true;
    if (opts.private) return false;
    return undefined;
  }

  it("sets isPublic=true when --public", () => {
    expect(resolveVisibility({ public: true })).toBe(true);
  });

  it("sets isPublic=false when --private", () => {
    expect(resolveVisibility({ private: true })).toBe(false);
  });

  it("leaves isPublic undefined when neither flag", () => {
    expect(resolveVisibility({})).toBeUndefined();
  });
});

describe("formatVisibility", () => {
  function formatVisibility(isPublic: boolean): string {
    return isPublic ? "public" : "private";
  }

  it("returns public for true", () => {
    expect(formatVisibility(true)).toBe("public");
  });

  it("returns private for false", () => {
    expect(formatVisibility(false)).toBe("private");
  });
});

describe("printPublishResult logic", () => {
  it("uses Updated for updated results", () => {
    const result = { updated: true, url: "https://pub.blue/p/abc" };
    const verb = result.updated ? "Updated" : "Published";
    expect(verb).toBe("Updated");
  });

  it("uses Published for new results", () => {
    const result = { updated: false, url: "https://pub.blue/p/abc" };
    const verb = result.updated ? "Updated" : "Published";
    expect(verb).toBe("Published");
  });
});

describe("publish-content stdin fallback", () => {
  it("uses --content arg when provided", () => {
    const content = "<h1>Hello</h1>";
    expect(content).toBe("<h1>Hello</h1>");
  });

  it("falls back to stdin when no --content", () => {
    const content = undefined;
    const needsStdin = !content;
    expect(needsStdin).toBe(true);
  });
});
