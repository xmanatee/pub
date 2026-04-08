import { describe, expect, it } from "vitest";
import { buildCanvasSrcDoc } from "~/features/live/utils/build-canvas-srcdoc";

const OPTIONS = { contentBaseUrl: "https://content.example/serve/demo/" };

describe("buildCanvasSrcDoc", () => {
  it("injects base/debug script into existing head", () => {
    const input = "<!doctype html><html><head><title>T</title></head><body>ok</body></html>";
    const output = buildCanvasSrcDoc(input, OPTIONS);
    expect(output).toContain(
      '<head><base href="https://content.example/serve/demo/" target="_blank">',
    );
    expect(output).toContain("<title>T</title>");
  });

  it("creates head when html tag exists without head", () => {
    const input = "<html><body>ok</body></html>";
    const output = buildCanvasSrcDoc(input, OPTIONS);
    expect(output).toContain(
      '<html><head><base href="https://content.example/serve/demo/" target="_blank">',
    );
    expect(output).toContain("<body>ok</body>");
  });

  it("wraps fragment content in a full document", () => {
    const input = "<div>fragment</div>";
    const output = buildCanvasSrcDoc(input, OPTIONS);
    expect(output).toContain("<!doctype html>");
    expect(output).toContain("<body><div>fragment</div></body>");
  });

  it("always injects pub command helpers", () => {
    const input = "<html><head></head><body>ok</body></html>";
    const output = buildCanvasSrcDoc(input, OPTIONS);

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
    const output = buildCanvasSrcDoc(input, OPTIONS);
    expect(output).toContain("origConsoleError");
    expect(output).toContain('emit("console-error"');
  });

  it("does not include preview capture code", () => {
    const input = "<html><head></head><body>ok</body></html>";
    const output = buildCanvasSrcDoc(input, OPTIONS);
    expect(output).not.toContain("capturePreview");
    expect(output).not.toContain("preview.captured");
  });
});

describe("buildCanvasSrcDoc idempotency", () => {
  it("uses swappable message handler to prevent listener accumulation", () => {
    const output = buildCanvasSrcDoc("<html><head></head><body>ok</body></html>", OPTIONS);
    // Must remove old handler before adding new one
    expect(output).toContain("window.__pubBridgeHandler");
    expect(output).toContain('window.removeEventListener("message",window.__pubBridgeHandler)');
    expect(output).toContain('window.addEventListener("message",handler)');
  });

  it("guards console.error wrapping to prevent chaining", () => {
    const output = buildCanvasSrcDoc("<html><head></head><body>ok</body></html>", OPTIONS);
    // Must store original once, not re-capture the wrapped version
    expect(output).toContain("window.__pubOrigConsoleError");
    expect(output).toContain("if(!window.__pubOrigConsoleError)");
    expect(output).toContain("var origConsoleError=window.__pubOrigConsoleError");
  });

  it("does not contain sandbox bootstrap or SW relay code", () => {
    const output = buildCanvasSrcDoc("<html><head></head><body>ok</body></html>", OPTIONS);
    // Must NOT contain infrastructure that belongs exclusively in sandbox/index.html
    expect(output).not.toContain("sandbox-ready");
    expect(output).not.toContain("registerSW");
    expect(output).not.toContain("keepalive");
    expect(output).not.toContain("pub-fs-request");
  });

  it("re-registers inject-content handler for subsequent document.write() cycles", () => {
    const output = buildCanvasSrcDoc("<html><head></head><body>ok</body></html>", OPTIONS);
    expect(output).toContain("window.__pubInjectHandler");
    expect(output).toContain('window.removeEventListener("message",window.__pubInjectHandler)');
    expect(output).toContain("inject-content");
    expect(output).toContain("document.write(d.html)");
  });
});
