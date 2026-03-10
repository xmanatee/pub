import type { Command } from "commander";
import {
  type BridgeMessage,
  CHANNELS,
  CONTROL_CHANNEL,
  generateMessageId,
} from "../../../../shared/bridge-protocol-core";
import { errorMessage, failCli } from "../../core/errors/cli-error.js";
import { parsePositiveInteger } from "../../core/utils/number.js";
import { formatApiError, messageContainsPong } from "../../live/runtime/command-utils.js";
import { resolveActiveSlug } from "../../live/runtime/daemon-process.js";
import { getAgentSocketPath, ipcCall } from "../../live/transport/ipc.js";
import { createClient } from "../shared/index.js";

export function registerDoctorCommand(program: Command): void {
  program
    .command("doctor")
    .description("Run end-to-end live checks (daemon, channels, chat/canvas ping)")
    .option("--timeout <seconds>", "Timeout for pong wait and repeated reads", "30")
    .option("--wait-pong", "Wait for user to reply with exact text 'pong' on chat channel")
    .option("--skip-chat", "Skip chat ping check")
    .option("--skip-canvas", "Skip canvas ping check")
    .action(
      async (opts: { timeout: string; waitPong?: boolean; skipChat?: boolean; skipCanvas?: boolean }) => {
        const timeoutSeconds = parsePositiveInteger(opts.timeout, "--timeout");
        const timeoutMs = timeoutSeconds * 1_000;
        const socketPath = getAgentSocketPath();
        const slug = await resolveActiveSlug().catch((error: unknown) =>
          failCli(`No active daemon. Run \`pub start\` first. (${errorMessage(error)})`),
        );
        const apiClient = createClient();

        const fail = (message: string): never => failCli(`Doctor failed: ${message}`);

        console.log(`Doctor: ${slug}`);

        const statusResponse = await ipcCall(socketPath, {
          method: "status",
          params: {},
        }).catch((error: unknown) => fail(`daemon is unreachable (${errorMessage(error)}).`));

        if (!statusResponse.ok) {
          fail(`daemon returned non-ok status: ${String(statusResponse.error || "unknown error")}`);
        }
        if (!statusResponse.connected) {
          fail("daemon is running but browser is not connected.");
        }

        const channelNames = Array.isArray(statusResponse.channels)
          ? statusResponse.channels.map((entry) => String(entry))
          : [];
        for (const required of [
          CONTROL_CHANNEL,
          CHANNELS.CHAT,
          CHANNELS.RENDER_ERROR,
          CHANNELS.COMMAND,
        ]) {
          if (!channelNames.includes(required)) {
            fail(`required channel is missing: ${required}`);
          }
        }
        console.log("Daemon/channel check: OK");

        const live = await apiClient
          .getLive()
          .catch((error: unknown) => fail(`failed to fetch live info from API: ${formatApiError(error)}`));
        const activeLive = live ?? fail("API reports no active live session.");
        if (activeLive.slug !== slug) {
          fail(`API reports active live for "${activeLive.slug}" instead of "${slug}".`);
        }

        if (activeLive.status !== "active") {
          fail(`API reports live is not active (status: ${activeLive.status})`);
        }
        if (typeof activeLive.browserOffer !== "string" || activeLive.browserOffer.length === 0) {
          fail("browser offer was not published.");
        }
        if (typeof activeLive.agentAnswer !== "string" || activeLive.agentAnswer.length === 0) {
          fail("agent answer was not published.");
        }
        console.log("API/signaling check: OK");

        if (!opts.skipChat) {
          const pingMsg: BridgeMessage = {
            id: generateMessageId(),
            type: "text",
            data: "This is a ping test. Reply with 'pong'.",
          };
          const writeResponse = await ipcCall(socketPath, {
            method: "write",
            params: { channel: CHANNELS.CHAT, msg: pingMsg },
          });
          if (!writeResponse.ok) {
            fail(`chat ping failed: ${String(writeResponse.error || "unknown write error")}`);
          }
          console.log("Chat ping write ACK: OK");

          if (opts.waitPong) {
            const startedAt = Date.now();
            let receivedPong = false;
            while (Date.now() - startedAt < timeoutMs) {
              const readResponse = await ipcCall(socketPath, {
                method: "read",
                params: { channel: CHANNELS.CHAT },
              });
              if (!readResponse.ok) {
                fail(
                  `chat read failed while waiting for pong: ${String(readResponse.error || "unknown read error")}`,
                );
              }
              const messages = Array.isArray(readResponse.messages) ? readResponse.messages : [];
              if (messages.some((entry) => messageContainsPong(entry))) {
                receivedPong = true;
                break;
              }
              await new Promise((resolve) => setTimeout(resolve, 1_000));
            }

            if (!receivedPong) {
              fail(`timed out after ${timeoutSeconds}s waiting for exact 'pong' reply on chat channel.`);
            }
            console.log("Chat pong roundtrip: OK");
          }
        }

        if (!opts.skipCanvas) {
          const stamp = new Date().toISOString();
          const canvasMsg: BridgeMessage = {
            id: generateMessageId(),
            type: "html",
            data: `<!doctype html><html><body style="margin:0;padding:24px;font-family:system-ui;background:#111;color:#f5f5f5">Canvas ping OK<br><small>${stamp}</small></body></html>`,
          };
          const canvasResponse = await ipcCall(socketPath, {
            method: "write",
            params: { channel: "canvas", msg: canvasMsg },
          });
          if (!canvasResponse.ok) {
            fail(`canvas ping failed: ${String(canvasResponse.error || "unknown write error")}`);
          }
          console.log("Canvas ping write ACK: OK");
        }

        console.log("Doctor: PASS");
      },
    );
}
