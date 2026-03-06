import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  liveInfoDir,
  liveSessionContentPath,
  readLatestCliVersion,
  readLogTail,
  writeLiveSessionContentFile,
} from "./daemon-files.js";

describe("daemon-files", () => {
  const tempRoots: string[] = [];
  const originalPubblueConfigDir = process.env.PUBBLUE_CONFIG_DIR;

  afterEach(() => {
    for (const dir of tempRoots) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tempRoots.length = 0;
    process.env.PUBBLUE_CONFIG_DIR = originalPubblueConfigDir;
    if (!originalPubblueConfigDir) delete process.env.PUBBLUE_CONFIG_DIR;
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

  describe("liveInfoDir", () => {
    it("respects PUBBLUE_CONFIG_DIR", () => {
      const dir = makeTempDir();
      process.env.PUBBLUE_CONFIG_DIR = dir;
      const result = liveInfoDir();
      expect(result).toBe(path.join(dir, "lives"));
      expect(fs.existsSync(result)).toBe(true);
    });
  });

  describe("session content files", () => {
    it("uses expected extension by content type", () => {
      const dir = makeTempDir();
      const htmlPath = liveSessionContentPath("alpha", "html", dir);
      const markdownPath = liveSessionContentPath("alpha", "markdown", dir);
      const textPath = liveSessionContentPath("alpha", "text", dir);
      const fallbackPath = liveSessionContentPath("alpha", "unknown", dir);
      expect(htmlPath.endsWith(".session-content.html")).toBe(true);
      expect(markdownPath.endsWith(".session-content.md")).toBe(true);
      expect(textPath.endsWith(".session-content.txt")).toBe(true);
      expect(fallbackPath.endsWith(".session-content.txt")).toBe(true);
    });

    it("sanitizes slug and writes content", () => {
      const dir = makeTempDir();
      const writtenPath = writeLiveSessionContentFile({
        slug: "weird/slug",
        contentType: "html",
        content: "<h1>Hello</h1>",
        rootDir: dir,
      });
      expect(path.basename(writtenPath)).toBe("weird-slug.session-content.html");
      expect(fs.readFileSync(writtenPath, "utf-8")).toBe("<h1>Hello</h1>");
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
