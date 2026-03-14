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
    expect(output).toContain("files.upload=uploadFile");
    expect(output).toContain("files.download=downloadFile");
    expect(output).toContain('emit("command.invoke"');
    expect(output).toContain('emit("file.upload"');
    expect(output).toContain('emit("file.download"');
    expect(output).toContain("command.result");
    expect(output).toContain("file.result");
    expect(output).toContain("getGuardTimeoutMs");
  });

  it("intercepts console.error", () => {
    const input = "<html><head></head><body>ok</body></html>";
    const output = buildCanvasSrcDoc(input);
    expect(output).toContain("origConsoleError");
    expect(output).toContain('emit("console-error"');
  });
});
