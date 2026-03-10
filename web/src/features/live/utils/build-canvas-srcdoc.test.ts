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

  it("keeps non-command canvases free of command helpers", () => {
    const input = "<html><head></head><body>ok</body></html>";
    const output = buildCanvasSrcDoc(input);

    expect(output).toContain('emit("ready",{})');
    expect(output).not.toContain("api.command=invokeCommand");
    expect(output).not.toContain("api.cancelCommand=cancelCommand");
    expect(output).not.toContain('emit("command.invoke"');
    expect(output).not.toContain('emit("command.cancel"');
    expect(output).not.toContain("command.result");
    expect(output).not.toContain("command.bind.result");
    expect(output).not.toContain("application/pub-command-manifest+json");
    expect(output).not.toContain("tryBindManifest");
    expect(output).not.toContain("startManifestBinding");
    expect(output).not.toContain("manifestRetryCount");
    expect(output).not.toContain("bridgeToken");
  });

  it("injects command helpers only when the canvas declares a command manifest", () => {
    const input = `
      <html>
        <head>
          <script type="application/pub-command-manifest+json">
            {"manifestId":"demo","functions":[{"name":"ping","returns":"text","executor":{"kind":"exec","command":"echo","args":["pong"]}}]}
          </script>
        </head>
        <body>ok</body>
      </html>
    `;
    const output = buildCanvasSrcDoc(input);

    expect(output).toContain("api.command=invokeCommand");
    expect(output).toContain("api.cancelCommand=cancelCommand");
    expect(output).toContain('emit("command.invoke"');
    expect(output).toContain('emit("command.cancel"');
    expect(output).toContain("command.result");
    expect(output).toContain("getGuardTimeoutMs");
  });
});
