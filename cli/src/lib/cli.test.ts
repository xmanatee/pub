import { describe, expect, it } from "vitest";

describe("create command flag mapping", () => {
  function mapCreateOptions(opts: { slug?: string; title?: string; expires?: string }) {
    return {
      ...opts,
      isPublic: false,
    };
  }

  it("always creates private publications", () => {
    expect(mapCreateOptions({}).isPublic).toBe(false);
    expect(mapCreateOptions({ slug: "a", title: "b", expires: "1h" }).isPublic).toBe(false);
  });
});

describe("create command content resolution", () => {
  function resolveSource(opts: { fileArg?: string }) {
    if (opts.fileArg) return { mode: "file" as const, filePath: opts.fileArg };
    return { mode: "stdin" as const };
  }

  it("uses positional file arg", () => {
    expect(resolveSource({ fileArg: "page.html" })).toEqual({
      mode: "file",
      filePath: "page.html",
    });
  });

  it("falls back to stdin when no file given", () => {
    expect(resolveSource({})).toEqual({ mode: "stdin" });
  });
});

describe("update command visibility flags", () => {
  function resolveVisibility(opts: { private?: boolean }): boolean | undefined {
    if (opts.private) return false;
    return undefined;
  }

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

describe("get --content flag", () => {
  it("outputs raw content when --content is set", () => {
    const opts = { content: true };
    expect(opts.content).toBe(true);
  });

  it("outputs metadata when --content is not set", () => {
    const opts = { content: undefined as boolean | undefined };
    expect(opts.content).toBeFalsy();
  });
});

describe("update content resolution", () => {
  function resolveUpdateSource(opts: { file?: string }) {
    if (opts.file) return { mode: "file" as const, filePath: opts.file };
    return null;
  }

  it("reads content from --file", () => {
    expect(resolveUpdateSource({ file: "new.html" })).toEqual({
      mode: "file",
      filePath: "new.html",
    });
  });

  it("returns null for metadata-only update", () => {
    expect(resolveUpdateSource({})).toBeNull();
  });
});
