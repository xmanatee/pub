import { describe, expect, it, vi } from "vitest";
import {
  binaryDownloadUrl,
  detectTarget,
  fetchLatestRelease,
  isNewer,
  resolveTarget,
  versionFromTag,
} from "../core/version/self-update.js";

describe("isNewer", () => {
  it("returns true when latest is a major bump", () => {
    expect(isNewer("2.0.0", "1.0.0")).toBe(true);
  });

  it("returns true when latest is a minor bump", () => {
    expect(isNewer("1.1.0", "1.0.0")).toBe(true);
  });

  it("returns true when latest is a patch bump", () => {
    expect(isNewer("1.0.1", "1.0.0")).toBe(true);
  });

  it("returns false when versions are equal", () => {
    expect(isNewer("1.0.0", "1.0.0")).toBe(false);
  });

  it("returns false when current is newer", () => {
    expect(isNewer("1.0.0", "1.0.1")).toBe(false);
    expect(isNewer("0.7.2", "0.8.0")).toBe(false);
  });
});

describe("detectTarget", () => {
  it("returns a valid target string", () => {
    const target = detectTarget();
    expect(target).toMatch(/^(darwin|linux)-(arm64|x64)$/);
  });
});

describe("resolveTarget", () => {
  it("maps supported targets", () => {
    expect(resolveTarget("darwin", "arm64")).toBe("darwin-arm64");
    expect(resolveTarget("linux", "x64")).toBe("linux-x64");
  });

  it("rejects unsupported platforms and architectures", () => {
    expect(() => resolveTarget("win32", "x64")).toThrow("Unsupported platform");
    expect(() => resolveTarget("linux", "ia32")).toThrow("Unsupported architecture");
  });
});

describe("binaryDownloadUrl", () => {
  it("builds the correct URL", () => {
    const url = binaryDownloadUrl("cli-v1.0.0", "darwin-arm64");
    expect(url).toBe(
      "https://github.com/xmanatee/pub/releases/download/cli-v1.0.0/pub-darwin-arm64",
    );
  });
});

describe("versionFromTag", () => {
  it("extracts the version from a CLI tag", () => {
    expect(versionFromTag("cli-v1.2.3")).toBe("1.2.3");
  });

  it("rejects invalid tags", () => {
    expect(() => versionFromTag("v1.2.3")).toThrow("Invalid CLI release tag");
  });
});

describe("fetchLatestRelease", () => {
  it("pages through releases until it finds a cli-v tag", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ tag_name: "web-v1.0.0" }]), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ tag_name: "cli-v1.2.3" }]), { status: 200 }),
      );

    await expect(fetchLatestRelease(fetchMock)).resolves.toEqual({
      tag: "cli-v1.2.3",
      version: "1.2.3",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
