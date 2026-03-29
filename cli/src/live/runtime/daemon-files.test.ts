import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ensureLiveSessionDirs,
  hydrateSessionWorkspace,
  liveInfoDir,
  liveRuntimeSessionArtifactsDir,
  liveRuntimeSessionAttachmentsDir,
  liveWorkspaceCanvasDir,
  liveWorkspaceSessionDir,
  pubCanvasDir,
  readLatestCliVersion,
  readLogTail,
  readWorkspaceFiles,
  writeCanvasMirror,
} from "./daemon-files.js";

describe("daemon-files", () => {
  const tempRoots: string[] = [];
  const originalPubHome = process.env.PUB_HOME;

  afterEach(() => {
    for (const dir of tempRoots) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tempRoots.length = 0;
    process.env.PUB_HOME = originalPubHome;
    if (!originalPubHome) delete process.env.PUB_HOME;
  });

  function makeTempHome(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pub-daemon-files-"));
    tempRoots.push(dir);
    process.env.PUB_HOME = dir;
    return dir;
  }

  describe("readLatestCliVersion", () => {
    it("returns null when version file does not exist", () => {
      const dir = makeTempHome();
      const versionPath = path.join(dir, "missing-version.txt");
      expect(readLatestCliVersion(versionPath)).toBeNull();
    });

    it("returns trimmed version value", () => {
      const dir = makeTempHome();
      const versionPath = path.join(dir, "cli-version.txt");
      fs.writeFileSync(versionPath, " 1.2.3 \n", "utf-8");
      expect(readLatestCliVersion(versionPath)).toBe("1.2.3");
    });

    it("throws on non-missing filesystem errors", () => {
      const dir = makeTempHome();
      expect(() => readLatestCliVersion(dir)).toThrow("Failed to read CLI version file");
    });
  });

  describe("liveInfoDir", () => {
    it("stores daemon metadata under PUB_HOME/runtime", () => {
      const dir = makeTempHome();
      const result = liveInfoDir();
      expect(result).toBe(path.join(dir, "runtime", "daemon", "info"));
      expect(fs.existsSync(result)).toBe(true);
    });
  });

  describe("session directories", () => {
    it("separates persistent pub canvas, workspace canvas, attachments, and artifacts", () => {
      makeTempHome();

      expect(liveWorkspaceSessionDir("alpha")).toContain(path.join("workspaces", "sessions", "alpha"));
      expect(liveWorkspaceCanvasDir("alpha")).toContain(
        path.join("workspaces", "sessions", "alpha", "canvas"),
      );
      expect(liveRuntimeSessionAttachmentsDir("alpha")).toContain(
        path.join("runtime", "sessions", "alpha", "attachments"),
      );
      expect(liveRuntimeSessionArtifactsDir("alpha")).toContain(
        path.join("runtime", "sessions", "alpha", "artifacts"),
      );
      expect(pubCanvasDir("pub-123")).toContain(path.join("canvas", "pubs", "pub-123", "files"));
    });

    it("hydrates a per-session workspace from the persistent pub canvas", () => {
      makeTempHome();

      const sessionPaths = hydrateSessionWorkspace({
        liveSessionId: "session-1",
        pubId: "pub-1",
        files: {
          "index.html": "<h1>Hello</h1>",
          "assets/app.js": "console.log('ok');",
        },
      });

      expect(fs.existsSync(sessionPaths.workspaceCanvasDir)).toBe(true);
      expect(fs.existsSync(sessionPaths.attachmentDir)).toBe(true);
      expect(fs.existsSync(sessionPaths.artifactsDir)).toBe(true);
      expect(fs.readFileSync(path.join(sessionPaths.workspaceCanvasDir, "index.html"), "utf-8")).toBe(
        "<h1>Hello</h1>",
      );
      expect(readWorkspaceFiles(sessionPaths.workspaceCanvasDir)).toEqual({
        "assets/app.js": "console.log('ok');",
        "index.html": "<h1>Hello</h1>",
      });
    });

    it("can mirror published files back into the persistent pub canvas", () => {
      makeTempHome();
      const canvasRoot = writeCanvasMirror("pub-2", {
        "index.html": "<h1>Saved</h1>",
        "images/chart.svg": "<svg />",
      });

      expect(canvasRoot).toBe(pubCanvasDir("pub-2"));
      expect(fs.readFileSync(path.join(canvasRoot, "index.html"), "utf-8")).toBe("<h1>Saved</h1>");
      expect(fs.readFileSync(path.join(canvasRoot, "images", "chart.svg"), "utf-8")).toBe(
        "<svg />",
      );
    });

    it("creates empty session runtime directories without publishing files", () => {
      makeTempHome();
      const sessionPaths = ensureLiveSessionDirs({ liveSessionId: "session-2", pubId: "pub-3" });

      expect(fs.existsSync(sessionPaths.workspaceCanvasDir)).toBe(true);
      expect(fs.existsSync(sessionPaths.attachmentDir)).toBe(true);
      expect(fs.existsSync(sessionPaths.artifactsDir)).toBe(true);
      expect(fs.existsSync(sessionPaths.pubCanvasDir)).toBe(true);
    });
  });

  describe("readLogTail", () => {
    it("returns null when log file does not exist", () => {
      const dir = makeTempHome();
      const logPath = path.join(dir, "missing.log");
      expect(readLogTail(logPath)).toBeNull();
    });

    it("returns the tail when content is larger than maxChars", () => {
      const dir = makeTempHome();
      const logPath = path.join(dir, "agent.log");
      fs.writeFileSync(logPath, "abcdef", "utf-8");
      expect(readLogTail(logPath, 3)).toBe("def");
    });

    it("throws on non-missing filesystem errors", () => {
      const dir = makeTempHome();
      expect(() => readLogTail(dir)).toThrow("Failed to read daemon log");
    });
  });
});
