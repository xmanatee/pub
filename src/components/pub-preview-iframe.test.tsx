import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PubPreviewIframe } from "./pub-preview-iframe";

describe("PubPreviewIframe", () => {
  it("renders html srcDoc preview with script sandbox by default", () => {
    const html = renderToStaticMarkup(
      <PubPreviewIframe contentPreview="<h1>Hello</h1>" title="Hello" />,
    );

    expect(html).toContain("srcDoc=");
    expect(html).toContain("Hello");
    expect(html).toContain('sandbox="allow-scripts"');
  });

  it("renders html URL preview with script sandbox when htmlSrc is provided", () => {
    const html = renderToStaticMarkup(
      <PubPreviewIframe
        contentPreview="<h1>Hello</h1>"
        htmlSrc="/serve/hello?preview=1"
        title="Hello"
      />,
    );

    expect(html).toContain('src="/serve/hello?preview=1"');
    expect(html).toContain('sandbox="allow-scripts"');
    expect(html).not.toContain("srcdoc=");
  });
});
