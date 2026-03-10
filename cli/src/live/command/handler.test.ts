import { describe, expect, it } from "vitest";
import type { BridgeMessage } from "../../../../shared/bridge-protocol-core";
import { makeEventMessage } from "../../../../shared/bridge-protocol-core";
import { parseCommandResultMessage } from "../../../../shared/command-protocol-core";
import { createLiveCommandHandler } from "./handler.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildHandler() {
  const sentMessages: BridgeMessage[] = [];
  const handler = createLiveCommandHandler({
    bridgeMode: "openclaw",
    bridgeConfig: {
      mode: "openclaw",
      bridgeCwd: "/tmp/pub-bridge",
      canvasReminderEvery: 10,
      deliver: false,
      deliverTimeoutMs: 120_000,
      attachmentDir: "/tmp/pub-attachments",
      attachmentMaxBytes: 5 * 1024 * 1024,
      commandDefaultTimeoutMs: 15_000,
      commandMaxOutputBytes: 256 * 1024,
      commandMaxConcurrent: 6,
      openclawPath: "/usr/local/bin/openclaw",
      sessionId: "session-1",
    },
    debugLog: () => {},
    markError: () => {},
    sendCommandMessage: async (msg) => {
      sentMessages.push(msg);
      return true;
    },
  });

  return {
    sentMessages,
    handler,
  };
}

function buildManifestHtml(functions: Array<Record<string, unknown>>): string {
  const manifest = JSON.stringify({ manifestId: "test-manifest", functions });
  return `<html><head><script type="application/pub-command-manifest+json">${manifest}</script></head><body></body></html>`;
}

function commandResults(messages: BridgeMessage[]) {
  return messages
    .map((message) => parseCommandResultMessage(message))
    .filter(
      (entry): entry is NonNullable<ReturnType<typeof parseCommandResultMessage>> => entry !== null,
    );
}

describe("createLiveCommandHandler", () => {
  it("binds from HTML and executes manifest-defined exec function", async () => {
    const { handler, sentMessages } = buildHandler();

    handler.bindFromHtml(
      buildManifestHtml([
        {
          name: "echoValue",
          returns: "text",
          executor: {
            kind: "exec",
            command: process.execPath,
            args: ["-e", "process.stdout.write(process.argv[1] ?? '')", "{{value}}"],
          },
        },
      ]),
    );

    await handler.onMessage(
      makeEventMessage("command.invoke", {
        v: 1,
        callId: "call-echo",
        name: "echoValue",
        args: { value: "hello" },
      }),
    );

    const results = commandResults(sentMessages).filter((entry) => entry.callId === "call-echo");
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      callId: "call-echo",
      ok: true,
      value: "hello",
    });
  });

  it("skips functions missing executor during bind", async () => {
    const { handler, sentMessages } = buildHandler();

    handler.bindFromHtml(
      buildManifestHtml([
        { name: "missingExecutor", returns: "text" },
        {
          name: "valid",
          returns: "text",
          executor: { kind: "exec", command: "echo" },
        },
      ]),
    );

    await handler.onMessage(
      makeEventMessage("command.invoke", {
        v: 1,
        callId: "call-missing",
        name: "missingExecutor",
      }),
    );

    const results = commandResults(sentMessages);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      callId: "call-missing",
      ok: false,
      error: { code: "COMMAND_NOT_FOUND" },
    });
  });

  it("executes manifest-defined shell function", async () => {
    const { handler, sentMessages } = buildHandler();

    handler.bindFromHtml(
      buildManifestHtml([
        {
          name: "shellEcho",
          returns: "text",
          executor: {
            kind: "shell",
            script: "printf shell-ok",
          },
        },
      ]),
    );

    await handler.onMessage(
      makeEventMessage("command.invoke", {
        v: 1,
        callId: "call-shell",
        name: "shellEcho",
      }),
    );

    const results = commandResults(sentMessages).filter((entry) => entry.callId === "call-shell");
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ ok: true, value: "shell-ok" });
  });

  it("returns COMMAND_NOT_FOUND for unknown command", async () => {
    const { handler, sentMessages } = buildHandler();

    await handler.onMessage(
      makeEventMessage("command.invoke", {
        v: 1,
        callId: "call-unknown",
        name: "doesNotExist",
      }),
    );

    const results = commandResults(sentMessages).filter((entry) => entry.callId === "call-unknown");
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      ok: false,
      error: {
        code: "COMMAND_NOT_FOUND",
      },
    });
  });

  it("clears bound commands when HTML no longer contains a manifest", async () => {
    const { handler, sentMessages } = buildHandler();

    handler.bindFromHtml(
      buildManifestHtml([
        {
          name: "echoValue",
          returns: "text",
          executor: {
            kind: "exec",
            command: process.execPath,
            args: ["-e", "process.stdout.write('ok')"],
          },
        },
      ]),
    );
    handler.bindFromHtml("");

    await handler.onMessage(
      makeEventMessage("command.invoke", {
        v: 1,
        callId: "call-cleared",
        name: "echoValue",
      }),
    );

    const results = commandResults(sentMessages).filter((entry) => entry.callId === "call-cleared");
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      ok: false,
      error: {
        code: "COMMAND_NOT_FOUND",
      },
    });
  });

  it("emits a single COMMAND_CANCELLED result for cancelled calls", async () => {
    const { handler, sentMessages } = buildHandler();

    handler.bindFromHtml(
      buildManifestHtml([
        {
          name: "slowInline",
          returns: "text",
          executor: {
            kind: "exec",
            command: process.execPath,
            args: ["-e", "setTimeout(() => process.stdout.write('done'), 1500)"],
          },
        },
      ]),
    );

    const invokePromise = handler.onMessage(
      makeEventMessage("command.invoke", {
        v: 1,
        callId: "call-cancel",
        name: "slowInline",
      }),
    );

    await sleep(80);

    await handler.onMessage(
      makeEventMessage("command.cancel", {
        v: 1,
        callId: "call-cancel",
        reason: "user_cancel",
      }),
    );

    await invokePromise;

    const results = commandResults(sentMessages).filter((entry) => entry.callId === "call-cancel");
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      callId: "call-cancel",
      ok: false,
      error: {
        code: "COMMAND_CANCELLED",
      },
    });
  });
});
