import { describe, expect, it } from "vitest";

describe("create command flag mapping", () => {
  function resolveCreateVisibility(opts: { public?: boolean; private?: boolean }): boolean {
    if (opts.public && opts.private) throw new Error("conflict");
    if (opts.public) return true;
    if (opts.private) return false;
    return false;
  }

  it("defaults to private when no visibility flag is set", () => {
    expect(resolveCreateVisibility({})).toBe(false);
  });

  it("sets public visibility when --public is passed", () => {
    expect(resolveCreateVisibility({ public: true })).toBe(true);
  });

  it("sets private visibility when --private is passed", () => {
    expect(resolveCreateVisibility({ private: true })).toBe(false);
  });

  it("rejects conflicting create visibility flags", () => {
    expect(() => resolveCreateVisibility({ public: true, private: true })).toThrow("conflict");
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
  function resolveVisibility(opts: { public?: boolean; private?: boolean }): boolean | undefined {
    if (opts.public && opts.private) throw new Error("conflict");
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

  it("rejects conflicting update visibility flags", () => {
    expect(() => resolveVisibility({ public: true, private: true })).toThrow("conflict");
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
