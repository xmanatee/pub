import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { formatVisibility, readFile, resolveVisibilityFlags } from "./shared.js";

describe("resolveVisibilityFlags", () => {
  it("returns true for --public", () => {
    expect(resolveVisibilityFlags({ public: true, commandName: "create" })).toBe(true);
  });

  it("returns false for --private", () => {
    expect(resolveVisibilityFlags({ private: true, commandName: "create" })).toBe(false);
  });

  it("returns undefined when neither visibility flag is set", () => {
    expect(resolveVisibilityFlags({ commandName: "update" })).toBeUndefined();
  });

  it("throws on conflicting visibility flags", () => {
    expect(() =>
      resolveVisibilityFlags({ public: true, private: true, commandName: "create" }),
    ).toThrow("Use only one of --public or --private for create.");
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
  it("reads existing file content and basename", () => {
    const dir = mkdtempSync(join(tmpdir(), "pubblue-read-file-"));
    const filePath = join(dir, "sample.txt");
    writeFileSync(filePath, "hello");

    expect(readFile(filePath)).toEqual({
      content: "hello",
      basename: "sample.txt",
    });

    rmSync(dir, { recursive: true, force: true });
  });

  it("throws clear error for missing files", () => {
    const missing = join(tmpdir(), "pubblue-missing-file.txt");
    expect(() => readFile(missing)).toThrow(`File not found: ${missing}`);
  });
});
