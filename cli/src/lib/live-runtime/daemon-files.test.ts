import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readLatestCliVersion, readLogTail } from "./daemon-files.js";

describe("daemon-files", () => {
  const tempRoots: string[] = [];

  afterEach(() => {
    for (const dir of tempRoots) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tempRoots.length = 0;
  });

  function makeTempDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pubblue-daemon-files-"));
    tempRoots.push(dir);
    return dir;
  }

  describe("readLatestCliVersion", () => {
    it("returns null when version file does not exist", () => {
      const dir = makeTempDir();
      const versionPath = path.join(dir, "missing-version.txt");
      expect(readLatestCliVersion(versionPath)).toBeNull();
    });

    it("returns trimmed version value", () => {
      const dir = makeTempDir();
      const versionPath = path.join(dir, "cli-version.txt");
      fs.writeFileSync(versionPath, " 1.2.3 \n", "utf-8");
      expect(readLatestCliVersion(versionPath)).toBe("1.2.3");
    });

    it("throws on non-missing filesystem errors", () => {
      const dir = makeTempDir();
      expect(() => readLatestCliVersion(dir)).toThrow("Failed to read CLI version file");
    });
  });

  describe("readLogTail", () => {
    it("returns null when log file does not exist", () => {
      const dir = makeTempDir();
      const logPath = path.join(dir, "missing.log");
      expect(readLogTail(logPath)).toBeNull();
    });

    it("returns the tail when content is larger than maxChars", () => {
      const dir = makeTempDir();
      const logPath = path.join(dir, "agent.log");
      fs.writeFileSync(logPath, "abcdef", "utf-8");
      expect(readLogTail(logPath, 3)).toBe("def");
    });

    it("throws on non-missing filesystem errors", () => {
      const dir = makeTempDir();
      expect(() => readLogTail(dir)).toThrow("Failed to read daemon log");
    });
  });
});
