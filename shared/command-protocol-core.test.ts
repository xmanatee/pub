import { describe, expect, it } from "vitest";
import { makeEventMessage } from "./bridge-protocol-core";
import {
  COMMAND_MANIFEST_MAX_FUNCTIONS,
  COMMAND_PROTOCOL_VERSION,
  extractManifestFromHtml,
  makeCommandBindMessage,
  makeCommandBindResultMessage,
  makeCommandCancelMessage,
  makeCommandInvokeMessage,
  makeCommandResultMessage,
  parseCommandBindMessage,
  parseCommandBindResultMessage,
  parseCommandCancelMessage,
  parseCommandFunctionList,
  parseCommandInvokeMessage,
  parseCommandResultMessage,
} from "./command-protocol-core";

describe("command-protocol-core", () => {
  it("round-trips bind payload with function executors", () => {
    const payload = {
      v: COMMAND_PROTOCOL_VERSION,
      manifestId: "manifest-mail",
      functions: [
        {
          name: "archiveEmail",
          returns: "void" as const,
          executor: {
            kind: "exec" as const,
            command: "gog",
            args: ["archive", "{{emailId}}"],
            env: { PROFILE: "prod" },
          },
        },
        {
          name: "summarizeEmail",
          returns: "text" as const,
          executor: {
            kind: "agent" as const,
            prompt: "Summarize email {{emailId}}",
            provider: "openclaw" as const,
          },
        },
      ],
    };

    const parsed = parseCommandBindMessage(makeCommandBindMessage(payload));
    expect(parsed).toEqual(payload);
  });

  it("parses function-list map input and normalizes names", () => {
    const functions = parseCommandFunctionList({
      archiveEmail: {
        returns: "void",
        executor: {
          kind: "exec",
          command: "gog",
          args: ["archive", "{{emailId}}"],
        },
      },
      summarizeEmail: {
        returns: "text",
        executor: {
          kind: "agent",
          prompt: "Summarize {{emailId}}",
          output: "text",
        },
      },
    });

    expect(functions).toHaveLength(2);
    expect(functions[0]?.name).toBe("archiveEmail");
    expect(functions[1]?.name).toBe("summarizeEmail");
  });

  it("caps parsed function list to manifest max", () => {
    const manyFunctions = Array.from(
      { length: COMMAND_MANIFEST_MAX_FUNCTIONS + 10 },
      (_, index) => ({
        name: `f${index}`,
        executor: {
          kind: "exec",
          command: "echo",
        },
      }),
    );
    const parsed = parseCommandFunctionList(manyFunctions);

    expect(parsed).toHaveLength(COMMAND_MANIFEST_MAX_FUNCTIONS);
    expect(parsed[0]?.name).toBe("f0");
    expect(parsed.at(-1)?.name).toBe(`f${COMMAND_MANIFEST_MAX_FUNCTIONS - 1}`);
  });

  it("round-trips bind-result/invoke/result/cancel payloads", () => {
    const bindResult = {
      v: COMMAND_PROTOCOL_VERSION,
      manifestId: "manifest-mail",
      accepted: [{ name: "archiveEmail", returns: "void" as const }],
      rejected: [
        {
          name: "invalidCommand",
          code: "INVALID_FUNCTION",
          message: "Function is missing executor definition.",
        },
      ],
    };
    const invoke = {
      v: COMMAND_PROTOCOL_VERSION,
      callId: "call-1",
      name: "archiveEmail",
      args: { emailId: "e-42" },
      timeoutMs: 4_000,
    };
    const result = {
      v: COMMAND_PROTOCOL_VERSION,
      callId: "call-2",
      ok: true,
      value: { summary: "ok" },
      durationMs: 120,
    };
    const cancel = {
      v: COMMAND_PROTOCOL_VERSION,
      callId: "call-3",
      reason: "user cancelled",
    };

    expect(parseCommandBindResultMessage(makeCommandBindResultMessage(bindResult))).toEqual(
      bindResult,
    );
    expect(parseCommandInvokeMessage(makeCommandInvokeMessage(invoke))).toEqual(invoke);
    expect(parseCommandResultMessage(makeCommandResultMessage(result))).toEqual(result);
    expect(parseCommandCancelMessage(makeCommandCancelMessage(cancel))).toEqual(cancel);
  });

  it("returns null for malformed command invoke/result messages", () => {
    expect(parseCommandInvokeMessage(makeEventMessage("command.invoke", { name: "x" }))).toBeNull();
    expect(parseCommandResultMessage(makeEventMessage("command.result", { ok: true }))).toBeNull();
    expect(
      parseCommandCancelMessage(makeEventMessage("command.cancel", { reason: "x" })),
    ).toBeNull();
  });

  it("extracts manifest from HTML with script tag", () => {
    const html = `<html><head>
      <script type="application/pubblue-command-manifest+json">
      {"manifestId":"m1","functions":[{"name":"foo","returns":"text","executor":{"kind":"exec","command":"echo"}}]}
      </script>
    </head><body></body></html>`;

    const result = extractManifestFromHtml(html);
    expect(result).not.toBeNull();
    expect(result?.manifestId).toBe("m1");
    expect(result?.functions).toHaveLength(1);
    expect(result?.functions[0]?.name).toBe("foo");
  });

  it("returns null for HTML without manifest script tag", () => {
    expect(extractManifestFromHtml("<html><body>hello</body></html>")).toBeNull();
  });

  it("returns null for empty manifest script tag", () => {
    const html = `<script type="application/pubblue-command-manifest+json"></script>`;
    expect(extractManifestFromHtml(html)).toBeNull();
  });
});
