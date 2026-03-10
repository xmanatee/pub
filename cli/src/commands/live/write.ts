import * as fs from "node:fs";
import * as path from "node:path";
import type { Command } from "commander";
import { type BridgeMessage, generateMessageId } from "../../../../shared/bridge-protocol-core";
import { failCli } from "../../core/errors/cli-error.js";
import { getMimeType, TEXT_FILE_EXTENSIONS } from "../../live/runtime/file-payload.js";
import { getAgentSocketPath, ipcCall } from "../../live/transport/ipc.js";

export function registerWriteCommand(program: Command): void {
  program
    .command("write")
    .description("Write data to a live channel")
    .argument("[message]", "Text message (or use --file)")
    .option("-c, --channel <channel>", "Channel name", "chat")
    .option("-f, --file <file>", "Read content from file")
    .action(async (messageArg: string | undefined, opts: { channel: string; file?: string }) => {
      let msg: BridgeMessage;
      let binaryBase64: string | undefined;

      if (opts.file) {
        const filePath = path.resolve(opts.file);
        const ext = path.extname(filePath).toLowerCase();
        const bytes = fs.readFileSync(filePath);
        const filename = path.basename(filePath);

        if (ext === ".html" || ext === ".htm") {
          msg = {
            id: generateMessageId(),
            type: "html",
            data: bytes.toString("utf-8"),
            meta: { title: filename, filename, mime: getMimeType(filePath), size: bytes.length },
          };
        } else if (TEXT_FILE_EXTENSIONS.has(ext)) {
          msg = {
            id: generateMessageId(),
            type: "text",
            data: bytes.toString("utf-8"),
            meta: { filename, mime: getMimeType(filePath), size: bytes.length },
          };
        } else {
          msg = {
            id: generateMessageId(),
            type: "binary",
            meta: { filename, mime: getMimeType(filePath), size: bytes.length },
          };
          binaryBase64 = bytes.toString("base64");
        }
      } else if (messageArg) {
        msg = {
          id: generateMessageId(),
          type: "text",
          data: messageArg,
        };
      } else {
        const chunks: Buffer[] = [];
        for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
        msg = {
          id: generateMessageId(),
          type: "text",
          data: Buffer.concat(chunks).toString("utf-8").trim(),
        };
      }

      const socketPath = getAgentSocketPath();
      const response = await ipcCall(socketPath, {
        method: "write",
        params: { channel: opts.channel, msg, binaryBase64 },
      });
      if (!response.ok) {
        failCli(`Failed: ${response.error}`);
      }
    });
}
