import { describe, expect, it } from "vitest";
import {
  isNonTrivialSnapshot,
  PREVIEW_SNAPSHOT_SOURCE,
  parsePreviewSnapshotMessage,
} from "./preview-snapshot-core";

describe("parsePreviewSnapshotMessage", () => {
  it("accepts a valid snapshot message", () => {
    const msg = {
      source: PREVIEW_SNAPSHOT_SOURCE,
      type: "snapshot",
      html: "<html><body>hi</body></html>",
    };
    expect(parsePreviewSnapshotMessage(msg)).toEqual(msg);
  });

  it("rejects wrong source", () => {
    expect(
      parsePreviewSnapshotMessage({ source: "other", type: "snapshot", html: "<html></html>" }),
    ).toBeNull();
  });

  it("rejects wrong type", () => {
    expect(
      parsePreviewSnapshotMessage({
        source: PREVIEW_SNAPSHOT_SOURCE,
        type: "ready",
        html: "<html></html>",
      }),
    ).toBeNull();
  });

  it("rejects empty html", () => {
    expect(
      parsePreviewSnapshotMessage({ source: PREVIEW_SNAPSHOT_SOURCE, type: "snapshot", html: "" }),
    ).toBeNull();
  });

  it("rejects whitespace-only html", () => {
    expect(
      parsePreviewSnapshotMessage({
        source: PREVIEW_SNAPSHOT_SOURCE,
        type: "snapshot",
        html: "   ",
      }),
    ).toBeNull();
  });

  it("rejects non-object input", () => {
    expect(parsePreviewSnapshotMessage(null)).toBeNull();
    expect(parsePreviewSnapshotMessage("string")).toBeNull();
    expect(parsePreviewSnapshotMessage(42)).toBeNull();
  });

  it("rejects missing html field", () => {
    expect(
      parsePreviewSnapshotMessage({ source: PREVIEW_SNAPSHOT_SOURCE, type: "snapshot" }),
    ).toBeNull();
  });
});

describe("isNonTrivialSnapshot", () => {
  it("accepts html with visible text", () => {
    expect(isNonTrivialSnapshot("<html><body><h1>Hello</h1></body></html>")).toBe(true);
  });

  it("accepts html with img element", () => {
    expect(isNonTrivialSnapshot('<html><body><img src="x.png"/></body></html>')).toBe(true);
  });

  it("accepts html with svg element", () => {
    expect(isNonTrivialSnapshot("<html><body><svg></svg></body></html>")).toBe(true);
  });

  it("accepts html with canvas element", () => {
    expect(isNonTrivialSnapshot("<html><body><canvas></canvas></body></html>")).toBe(true);
  });

  it("accepts html with video element", () => {
    expect(isNonTrivialSnapshot('<html><body><video src="v.mp4"></video></body></html>')).toBe(
      true,
    );
  });

  it("accepts html with table element", () => {
    expect(
      isNonTrivialSnapshot("<html><body><table><tr><td></td></tr></table></body></html>"),
    ).toBe(true);
  });

  it("rejects empty body", () => {
    expect(isNonTrivialSnapshot("<html><head></head><body></body></html>")).toBe(false);
  });

  it("rejects body with only empty divs", () => {
    expect(isNonTrivialSnapshot("<html><body><div><div></div></div></body></html>")).toBe(false);
  });

  it("rejects body with only whitespace", () => {
    expect(isNonTrivialSnapshot("<html><body>   \n  </body></html>")).toBe(false);
  });

  it("handles html without body tags (fragment)", () => {
    expect(isNonTrivialSnapshot("<div>content</div>")).toBe(true);
    expect(isNonTrivialSnapshot("<div></div>")).toBe(false);
  });
});
