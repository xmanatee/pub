import { describe, expect, it } from "vitest";
import { PREVIEW_SNAPSHOT_SOURCE } from "../../../shared/preview-snapshot-core";
import { buildPreviewSnapshotScript, injectIntoHead } from "./preview-snapshot";

describe("buildPreviewSnapshotScript", () => {
  const script = buildPreviewSnapshotScript();

  it("wraps output in a script tag", () => {
    expect(script).toMatch(/^<script>.*<\/script>$/);
  });

  it("embeds the shared protocol source constant", () => {
    expect(script).toContain(`"${PREVIEW_SNAPSHOT_SOURCE}"`);
  });

  it("includes CSSOM extraction", () => {
    expect(script).toContain("styleSheets");
    expect(script).toContain("cssRules");
  });

  it("includes canvas capture", () => {
    expect(script).toContain("toDataURL");
  });

  it("removes script elements", () => {
    expect(script).toContain("querySelectorAll('script')");
  });

  it("removes noscript elements", () => {
    expect(script).toContain("querySelectorAll('noscript')");
  });

  it("removes inline event handlers", () => {
    expect(script).toContain("lastIndexOf('on',0)");
  });

  it("uses MutationObserver for idle detection", () => {
    expect(script).toContain("MutationObserver");
  });

  it("validates visible content before sending", () => {
    expect(script).toContain("hasContent");
    expect(script).toContain("innerText");
  });

  it("posts message with correct protocol shape", () => {
    expect(script).toContain("source:SRC");
    expect(script).toContain("type:'snapshot'");
    expect(script).toContain("html:c.outerHTML");
  });
});

describe("injectIntoHead", () => {
  const tag = "<meta test />";

  it("injects before </head> (lowercase)", () => {
    const html = "<html><head><title>T</title></head><body>ok</body></html>";
    expect(injectIntoHead(html, tag)).toBe(
      "<html><head><title>T</title><meta test /></head><body>ok</body></html>",
    );
  });

  it("injects before </HEAD> (uppercase)", () => {
    const html = "<html><HEAD><title>T</title></HEAD><body>ok</body></html>";
    expect(injectIntoHead(html, tag)).toBe(
      "<html><HEAD><title>T</title><meta test /></HEAD><body>ok</body></html>",
    );
  });

  it("injects before </head > with whitespace", () => {
    const html = "<html><head></head ><body></body></html>";
    expect(injectIntoHead(html, tag)).toBe("<html><head><meta test /></head ><body></body></html>");
  });

  it("wraps in <head> when no closing head tag exists", () => {
    const html = "<div>content</div>";
    expect(injectIntoHead(html, tag)).toBe("<head><meta test /></head><div>content</div>");
  });

  it("wraps in <head> for bare fragments", () => {
    expect(injectIntoHead("hello", tag)).toBe("<head><meta test /></head>hello");
  });
});
