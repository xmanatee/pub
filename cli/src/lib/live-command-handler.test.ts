import { describe, expect, it } from "vitest";
import type { BridgeMessage } from "../../../shared/bridge-protocol-core";
import { makeEventMessage } from "../../../shared/bridge-protocol-core";
import {
  parseCommandBindResultMessage,
  parseCommandResultMessage,
} from "../../../shared/command-protocol-core";
import { createLiveCommandHandler } from "./live-command-handler.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildHandler() {
  const sentMessages: BridgeMessage[] = [];
  const handler = createLiveCommandHandler({
    bridgeMode: "openclaw",
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

function commandResults(messages: BridgeMessage[]) {
  return messages
    .map((message) => parseCommandResultMessage(message))
    .filter(
      (entry): entry is NonNullable<ReturnType<typeof parseCommandResultMessage>> => entry !== null,
    );
}

function commandBindResults(messages: BridgeMessage[]) {
  return messages
    .map((message) => parseCommandBindResultMessage(message))
    .filter(
      (entry): entry is NonNullable<ReturnType<typeof parseCommandBindResultMessage>> =>
        entry !== null,
    );
}

describe("createLiveCommandHandler", () => {
  it("binds and executes manifest-defined exec function", async () => {
    const { handler, sentMessages } = buildHandler();

    await handler.onMessage(
      makeEventMessage("command.bind", {
        v: 1,
        manifestId: "manifest-mail",
        functions: [
          {
            name: "echoValue",
            returns: "text",
            executor: {
              kind: "exec",
              command: process.execPath,
              args: ["-e", "process.stdout.write(process.argv[1] ?? '')", "{{value}}"],
            },
          },
        ],
      }),
    );

    await handler.onMessage(
      makeEventMessage("command.invoke", {
        v: 1,
        callId: "call-echo",
        name: "echoValue",
        args: { value: "hello" },
      }),
    );

    const bindResults = commandBindResults(sentMessages);
    expect(bindResults).toHaveLength(1);
    expect(bindResults[0]).toMatchObject({
      manifestId: "manifest-mail",
      accepted: [{ name: "echoValue", returns: "text" }],
      rejected: [],
    });

    const results = commandResults(sentMessages).filter((entry) => entry.callId === "call-echo");
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      callId: "call-echo",
      ok: true,
      value: "hello",
    });
  });

  it("rejects bound functions that are missing executor", async () => {
    const { handler, sentMessages } = buildHandler();

    await handler.onMessage(
      makeEventMessage("command.bind", {
        v: 1,
        manifestId: "manifest-invalid",
        functions: [
          {
            name: "missingExecutor",
            returns: "text",
          },
        ],
      }),
    );

    const bindResults = commandBindResults(sentMessages);
    expect(bindResults).toHaveLength(1);
    expect(bindResults[0]).toMatchObject({
      accepted: [],
      rejected: [
        {
          name: "missingExecutor",
          code: "INVALID_FUNCTION",
        },
      ],
    });
  });

  it("executes manifest-defined shell function", async () => {
    const { handler, sentMessages } = buildHandler();

    await handler.onMessage(
      makeEventMessage("command.bind", {
        v: 1,
        manifestId: "manifest-shell",
        functions: [
          {
            name: "shellEcho",
            returns: "text",
            executor: {
              kind: "shell",
              script: "printf shell-ok",
            },
          },
        ],
      }),
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

  it("emits a single COMMAND_CANCELLED result for cancelled calls", async () => {
    const { handler, sentMessages } = buildHandler();

    await handler.onMessage(
      makeEventMessage("command.bind", {
        v: 1,
        manifestId: "manifest-cancel",
        functions: [
          {
            name: "slowInline",
            returns: "text",
            executor: {
              kind: "exec",
              command: process.execPath,
              args: ["-e", "setTimeout(() => process.stdout.write('done'), 1500)"],
            },
          },
        ],
      }),
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
