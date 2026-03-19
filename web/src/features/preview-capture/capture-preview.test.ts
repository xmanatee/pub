// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

/**
 * Tests the capture logic that runs inside the canvas iframe.
 * Since jsdom can't execute scripts inside srcdoc iframes, we replicate
 * the capturePreview() logic from build-canvas-srcdoc.ts against a
 * jsdom document directly.
 */
function capturePreview(doc: Document): string {
  const c = doc.documentElement.cloneNode(true) as HTMLElement;

  const rules: string[] = [];
  for (let i = 0; i < doc.styleSheets.length; i++) {
    try {
      const r = doc.styleSheets[i].cssRules;
      if (r) for (let j = 0; j < r.length; j++) rules.push(r[j].cssText);
    } catch {
      /* cross-origin sheets */
    }
  }

  for (const el of c.querySelectorAll("script")) el.remove();
  for (const el of c.querySelectorAll("noscript")) el.remove();

  const all = c.querySelectorAll("*");
  for (let i = 0; i < all.length; i++) {
    const a = all[i].attributes;
    for (let j = a.length - 1; j >= 0; j--) {
      if (a[j].name.lastIndexOf("on", 0) === 0) all[i].removeAttribute(a[j].name);
    }
  }

  if (rules.length > 0) {
    let h = c.querySelector("head");
    if (!h) {
      h = doc.createElement("head");
      c.insertBefore(h, c.firstChild);
    }
    const st = doc.createElement("style");
    st.textContent = rules.join("\n");
    h.appendChild(st);
  }

  return c.outerHTML;
}

function makeDoc(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

describe("capturePreview logic", () => {
  it("strips script tags", () => {
    const result = capturePreview(
      makeDoc("<html><head></head><body><p>Hello</p><script>alert(1)</script></body></html>"),
    );
    expect(result).toContain("<p>Hello</p>");
    expect(result).not.toContain("<script");
  });

  it("strips noscript tags", () => {
    const result = capturePreview(
      makeDoc("<html><head></head><body><noscript>Enable JS</noscript><p>Ok</p></body></html>"),
    );
    expect(result).toContain("<p>Ok</p>");
    expect(result).not.toContain("<noscript");
  });

  it("strips inline event handlers", () => {
    const result = capturePreview(
      makeDoc(
        '<html><head></head><body><button onclick="alert(1)" onmouseover="x()">Click</button></body></html>',
      ),
    );
    expect(result).toContain("Click");
    expect(result).not.toContain("onclick");
    expect(result).not.toContain("onmouseover");
  });

  it("preserves non-event attributes", () => {
    const result = capturePreview(
      makeDoc('<html><head></head><body><div id="main" class="box">Text</div></body></html>'),
    );
    expect(result).toContain('id="main"');
    expect(result).toContain('class="box"');
  });

  it("preserves inline styles", () => {
    const result = capturePreview(
      makeDoc('<html><head></head><body><div style="color:red">Styled</div></body></html>'),
    );
    expect(result).toContain("color:red");
  });

  it("preserves style tags", () => {
    const result = capturePreview(
      makeDoc("<html><head><style>body{margin:0}</style></head><body><p>Content</p></body></html>"),
    );
    expect(result).toContain("<style>");
    expect(result).toContain("<p>Content</p>");
  });

  it("returns a full HTML document", () => {
    const result = capturePreview(makeDoc("<div>fragment</div>"));
    expect(result).toMatch(/^<html/i);
    expect(result).toContain("fragment");
  });

  it("does not modify the original document", () => {
    const doc = makeDoc(
      '<html><head></head><body><script>x()</script><button onclick="y()">Go</button></body></html>',
    );
    capturePreview(doc);
    expect(doc.querySelectorAll("script")).toHaveLength(1);
    expect(doc.querySelector("button")?.getAttribute("onclick")).toBe("y()");
  });

  it("handles multiple scripts and handlers", () => {
    const result = capturePreview(
      makeDoc(
        '<html><head><script>a()</script></head><body><script>b()</script><div onload="c()" onfocus="d()">X</div></body></html>',
      ),
    );
    expect(result).not.toContain("<script");
    expect(result).not.toContain("onload");
    expect(result).not.toContain("onfocus");
    expect(result).toContain("X");
  });
});
