import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildServePreviewUrl, PubPreviewIframe } from "./pub-preview-iframe";

beforeEach(() => {
  vi.stubEnv("VITE_CONVEX_URL", "https://example.convex.cloud");
});

describe("buildServePreviewUrl", () => {
  it("returns an absolute URL pointing to the Convex site origin", () => {
    expect(buildServePreviewUrl("my-slug")).toBe(
      "https://example.convex.site/serve/my-slug?preview=1",
    );
  });
});

describe("PubPreviewIframe", () => {
  it("renders iframe with absolute serve URL and sandbox", () => {
    const html = renderToStaticMarkup(<PubPreviewIframe slug="hello" title="Hello" />);
    expect(html).toContain("https://example.convex.site/serve/hello?preview=1");
    expect(html).toContain('sandbox="allow-scripts"');
  });
});
