import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertPubFsWriteParent,
  PUB_FS_SESSION_PATH_PREFIX,
  resolveExistingPubFsPath,
  resolvePubFsRequestPath,
} from "./pub-fs-paths.js";

describe("pub-fs-paths", () => {
  const tempRoots: string[] = [];

  afterEach(() => {
    for (const dir of tempRoots) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tempRoots.length = 0;
  });

  function makeTempDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pub-pub-fs-paths-"));
    tempRoots.push(dir);
    return dir;
  }

  it("rejects paths outside the session workspace contract", () => {
    expect(() => resolvePubFsRequestPath("/tmp/example.txt", null)).toThrow(
      'start with "/./"',
    );
  });

  it("resolves session-relative paths inside the active workspace", () => {
    const sessionRoot = makeTempDir();
    const resolved = resolvePubFsRequestPath(`${PUB_FS_SESSION_PATH_PREFIX}images/chart.png`, sessionRoot);
    expect(resolved).toEqual({
      path: path.join(fs.realpathSync(sessionRoot), "images", "chart.png"),
      scope: "session",
    });
  });

  it("rejects session-relative paths that escape the workspace", () => {
    const sessionRoot = makeTempDir();
    expect(() =>
      resolvePubFsRequestPath(`${PUB_FS_SESSION_PATH_PREFIX}../outside.txt`, sessionRoot),
    ).toThrow("escapes the active pub workspace");
  });

  it("rejects session-relative paths when no workspace is active", () => {
    expect(() => resolvePubFsRequestPath(`${PUB_FS_SESSION_PATH_PREFIX}note.txt`, null)).toThrow(
      "No active pub workspace",
    );
  });

  it("verifies existing files stay within the workspace after realpath", () => {
    const sessionRoot = makeTempDir();
    const filePath = path.join(sessionRoot, "note.txt");
    fs.writeFileSync(filePath, "hello", "utf-8");
    expect(resolveExistingPubFsPath(`${PUB_FS_SESSION_PATH_PREFIX}note.txt`, sessionRoot)).toBe(
      fs.realpathSync(filePath),
    );
  });

  it("verifies write parents stay within the workspace after realpath", () => {
    const sessionRoot = makeTempDir();
    const nestedDir = path.join(sessionRoot, "nested");
    fs.mkdirSync(nestedDir, { recursive: true });
    expect(() =>
      assertPubFsWriteParent(path.join(nestedDir, "out.txt"), "session", sessionRoot),
    ).not.toThrow();
  });
});
