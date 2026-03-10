import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { formatVisibility, readFile, resolveVisibilityFlags } from "./shared/index.js";

describe("resolveVisibilityFlags", () => {
  it("returns true for --public", () => {
    expect(resolveVisibilityFlags({ public: true, commandName: "update" })).toBe(true);
  });

  it("returns false for --private", () => {
    expect(resolveVisibilityFlags({ private: true, commandName: "update" })).toBe(false);
  });

  it("returns undefined when neither visibility flag is set", () => {
    expect(resolveVisibilityFlags({ commandName: "update" })).toBeUndefined();
  });

  it("throws on conflicting visibility flags", () => {
    expect(() =>
      resolveVisibilityFlags({ public: true, private: true, commandName: "update" }),
    ).toThrow("Use only one of --public or --private for update.");
  });
});

describe("formatVisibility", () => {
  it("formats public visibility", () => {
    expect(formatVisibility(true)).toBe("public");
  });

  it("formats private visibility", () => {
    expect(formatVisibility(false)).toBe("private");
  });
});

describe("readFile", () => {
  it("reads existing file content", () => {
    const dir = mkdtempSync(join(tmpdir(), "pub-read-file-"));
    const filePath = join(dir, "sample.txt");
    writeFileSync(filePath, "hello");

    expect(readFile(filePath)).toBe("hello");

    rmSync(dir, { recursive: true, force: true });
  });

  it("throws clear error for missing files", () => {
    const missing = join(tmpdir(), "pub-missing-file.txt");
    expect(() => readFile(missing)).toThrow(`File not found: ${missing}`);
  });
});
