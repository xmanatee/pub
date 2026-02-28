import * as fs from "node:fs";
import * as path from "node:path";
import type { Command } from "commander";
import { type BridgeMessage, CHANNELS, generateMessageId } from "../../lib/bridge-protocol.js";
import { getSocketPath, ipcCall } from "../../lib/tunnel-ipc.js";
import {
  getFollowReadDelayMs,
  getMimeType,
  resolveActiveTunnel,
  resolveTunnelIdSelection,
  TEXT_FILE_EXTENSIONS,
} from "../tunnel-helpers.js";

export function registerTunnelMessageCommands(tunnel: Command): void {
  tunnel
    .command("write")
    .description("Write data to a channel")
    .argument("[message]", "Text message (or use --file)")
    .option("-t, --tunnel <tunnelId>", "Tunnel ID (auto-detected if one active)")
    .option("-c, --channel <channel>", "Channel name", "chat")
    .option("-f, --file <file>", "Read content from file")
    .action(
      async (
        messageArg: string | undefined,
        opts: { tunnel?: string; channel: string; file?: string },
      ) => {
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

        const tunnelId = opts.tunnel || (await resolveActiveTunnel());
        const socketPath = getSocketPath(tunnelId);

        const response = await ipcCall(socketPath, {
          method: "write",
          params: { channel: opts.channel, msg, binaryBase64 },
        });
        if (!response.ok) {
          console.error(`Failed: ${response.error}`);
          process.exit(1);
        }
      },
    );

  tunnel
    .command("read")
    .description("Read buffered messages from channels")
    .argument("[tunnelId]", "Tunnel ID (auto-detected if one active)")
    .option("-t, --tunnel <tunnelId>", "Tunnel ID (alternative to positional arg)")
    .option("-c, --channel <channel>", "Filter by channel")
    .option("--follow", "Stream messages continuously")
    .option("--all", "With --follow, include all channels instead of chat-only default")
    .action(
      async (
        tunnelIdArg: string | undefined,
        opts: { tunnel?: string; channel?: string; follow?: boolean; all?: boolean },
      ) => {
        const tunnelId =
          resolveTunnelIdSelection(tunnelIdArg, opts.tunnel) || (await resolveActiveTunnel());
        const socketPath = getSocketPath(tunnelId);
        const readChannel = opts.channel || (opts.follow && !opts.all ? CHANNELS.CHAT : undefined);

        if (opts.follow) {
          if (!opts.channel && !opts.all) {
            console.error(
              "Following chat channel by default. Use `--all` to include binary/file channels.",
            );
          }

          let consecutiveFailures = 0;
          let warnedDisconnected = false;

          while (true) {
            try {
              const response = await ipcCall(socketPath, {
                method: "read",
                params: { channel: readChannel },
              });

              if (warnedDisconnected) {
                console.error("Daemon reconnected.");
                warnedDisconnected = false;
              }

              consecutiveFailures = 0;
              if (response.messages && response.messages.length > 0) {
                for (const m of response.messages) {
                  console.log(JSON.stringify(m));
                }
              }
            } catch (error) {
              consecutiveFailures += 1;
              if (!warnedDisconnected) {
                const detail = error instanceof Error ? ` ${error.message}` : "";
                console.error(`Daemon disconnected. Waiting for recovery...${detail}`);
                warnedDisconnected = true;
              }
            }

            const delayMs = getFollowReadDelayMs(warnedDisconnected, consecutiveFailures);
            await new Promise((resolve) => setTimeout(resolve, delayMs));
          }
        } else {
          const response = await ipcCall(socketPath, {
            method: "read",
            params: { channel: readChannel },
          });
          if (!response.ok) {
            console.error(`Failed: ${response.error}`);
            process.exit(1);
          }
          console.log(JSON.stringify(response.messages || [], null, 2));
        }
      },
    );
}
