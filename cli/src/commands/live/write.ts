import * as path from "node:path";
import type { Command } from "commander";
import { type BridgeMessage, generateMessageId } from "../../../../shared/bridge-protocol-core";
import { failCli } from "../../core/errors/cli-error.js";
import { getMimeType, TEXT_FILE_EXTENSIONS } from "../../live/runtime/file-payload.js";
import { createCliCommandContext, type CliCommandContext } from "../shared/index.js";

interface WriteCommandOptions {
  channel: string;
  file?: string;
}

function buildFileMessage(
  context: CliCommandContext,
  filePath: string,
): { binaryBase64?: string; msg: BridgeMessage } {
  const { bytes, resolvedPath } = context.readFileBytes(filePath);
  const ext = path.extname(resolvedPath).toLowerCase();
  const filename = path.basename(resolvedPath);

  if (ext === ".html" || ext === ".htm") {
    return {
      msg: {
        id: generateMessageId(),
        type: "html",
        data: bytes.toString("utf-8"),
        meta: { title: filename, filename, mime: getMimeType(resolvedPath), size: bytes.length },
      },
    };
  }

  if (TEXT_FILE_EXTENSIONS.has(ext)) {
    return {
      msg: {
        id: generateMessageId(),
        type: "text",
        data: bytes.toString("utf-8"),
        meta: { filename, mime: getMimeType(resolvedPath), size: bytes.length },
      },
    };
  }

  return {
    msg: {
      id: generateMessageId(),
      type: "binary",
      meta: { filename, mime: getMimeType(resolvedPath), size: bytes.length },
    },
    binaryBase64: bytes.toString("base64"),
  };
}

export function registerWriteCommand(program: Command): void {
  program
    .command("write")
    .description("Write data to a live channel")
    .argument("[message]", "Text message (or use --file)")
    .option("-c, --channel <channel>", "Channel name", "chat")
    .option("-f, --file <file>", "Read content from file")
    .action(async (messageArg: string | undefined, opts: WriteCommandOptions) => {
      const context = createCliCommandContext();

      if (opts.file && messageArg !== undefined) {
        failCli("Use either a message argument or --file, not both.");
      }

      const { msg, binaryBase64 } = opts.file
        ? buildFileMessage(context, opts.file)
        : messageArg !== undefined
          ? {
              msg: {
                id: generateMessageId(),
                type: "text" as const,
                data: messageArg,
              },
            }
          : {
              msg: {
                id: generateMessageId(),
                type: "text" as const,
                data: await context.readStdinText({
                  trim: true,
                  missingMessage:
                    "No message provided. Pass text, use --file, or pipe stdin to `pub write`.",
                }),
              },
            };

      await context.requireDaemonResponse(
        {
          method: "write",
          params: { channel: opts.channel, msg, binaryBase64 },
        },
        "Failed to write live message",
      );
    });
}
