import { describe, expect, it } from "vitest";
import { buildCanvasSrcDoc } from "~/features/live/utils/build-canvas-srcdoc";

describe("buildCanvasSrcDoc", () => {
  it("injects base/debug script into existing head", () => {
    const input = "<!doctype html><html><head><title>T</title></head><body>ok</body></html>";
    const output = buildCanvasSrcDoc(input);
    expect(output).toContain('<head><base target="_blank">');
    expect(output).toContain("<title>T</title>");
  });

  it("creates head when html tag exists without head", () => {
    const input = "<html><body>ok</body></html>";
    const output = buildCanvasSrcDoc(input);
    expect(output).toContain('<html><head><base target="_blank">');
    expect(output).toContain("<body>ok</body>");
  });

  it("wraps fragment content in a full document", () => {
    const input = "<div>fragment</div>";
    const output = buildCanvasSrcDoc(input);
    expect(output).toContain("<!doctype html>");
    expect(output).toContain("<body><div>fragment</div></body>");
  });

  it("always injects pub command helpers", () => {
    const input = "<html><head></head><body>ok</body></html>";
    const output = buildCanvasSrcDoc(input);

    expect(output).toContain('emit("ready",{})');
    expect(output).toContain("api.command=invokeCommand");
    expect(output).toContain("api.cancelCommand=cancelCommand");
    expect(output).toContain('emit("command.invoke"');
    expect(output).toContain("command.result");
    expect(output).toContain("getGuardTimeoutMs");
    expect(output).not.toContain("files.upload");
    expect(output).not.toContain("files.download");
    expect(output).not.toContain("file.result");
  });

  it("intercepts console.error", () => {
    const input = "<html><head></head><body>ok</body></html>";
    const output = buildCanvasSrcDoc(input);
    expect(output).toContain("origConsoleError");
    expect(output).toContain('emit("console-error"');
  });

  it("includes preview capture handler", () => {
    const input = "<html><head></head><body>ok</body></html>";
    const output = buildCanvasSrcDoc(input);
    expect(output).toContain("function capturePreview()");
    expect(output).toContain("preview.capture");
    expect(output).toContain("preview.captured");
  });

  it("preview capture strips scripts and event handlers", () => {
    const input = "<html><head></head><body>ok</body></html>";
    const output = buildCanvasSrcDoc(input);
    expect(output).toContain("querySelectorAll('script')");
    expect(output).toContain("querySelectorAll('noscript')");
    expect(output).toContain("removeAttribute(a[j].name)");
  });

  it("preview capture extracts CSSOM rules", () => {
    const input = "<html><head></head><body>ok</body></html>";
    const output = buildCanvasSrcDoc(input);
    expect(output).toContain("document.styleSheets");
    expect(output).toContain("cssRules");
  });

  it("preview capture converts canvas elements to images", () => {
    const input = "<html><head></head><body>ok</body></html>";
    const output = buildCanvasSrcDoc(input);
    expect(output).toContain("toDataURL()");
    expect(output).toContain("replaceChild(img,cc[i])");
  });
});
