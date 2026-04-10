import type { Command } from "commander";
import {
  type BridgeMessage,
  CHANNELS,
  CONTROL_CHANNEL,
  generateMessageId,
} from "../../../../shared/bridge-protocol-core";
import { errorMessage, failCli } from "../../core/errors/cli-error.js";
import { formatApiError } from "../../live/runtime/command-utils.js";
import { createCliCommandContext } from "../shared/index.js";

interface DoctorCommandOptions {
  skipChat?: boolean;
  skipCanvas?: boolean;
}

export function registerDoctorCommand(program: Command): void {
  program
    .command("doctor")
    .description("Run end-to-end live checks (daemon, channels, chat/canvas ping)")
    .option("--skip-chat", "Skip chat ping check")
    .option("--skip-canvas", "Skip canvas ping check")
    .action(async (opts: DoctorCommandOptions) => {
      const context = createCliCommandContext();
      const slug = await context
        .resolveActiveSlug()
        .catch((error: unknown) =>
          failCli(`No active daemon. Run \`pub start\` first. (${errorMessage(error)})`),
        );
      const apiClient = context.getApiClient();

      const fail = (message: string): never => failCli(`Doctor failed: ${message}`);

      console.log(`Doctor: ${slug}`);

      const statusResponse = await context.requireDaemonResponse(
        { method: "status", params: {} },
        "daemon is unreachable",
      );
      if (statusResponse.connectionState !== "connected") {
        fail("daemon is running but browser is not connected.");
      }

      for (const required of [
        CONTROL_CHANNEL,
        CHANNELS.CHAT,
        CHANNELS.RENDER_ERROR,
        CHANNELS.COMMAND,
      ]) {
        if (!statusResponse.channels.includes(required)) {
          fail(`required channel is missing: ${required}`);
        }
      }
      console.log("Daemon/channel check: OK");

      const live = await apiClient
        .getLive()
        .catch((error: unknown) =>
          fail(`failed to fetch live info from API: ${formatApiError(error)}`),
        );
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
        await context.requireDaemonResponse(
          { method: "write", params: { channel: CHANNELS.CHAT, msg: pingMsg } },
          "chat ping failed",
        );
        console.log("Chat ping write ACK: OK");
      }

      if (!opts.skipCanvas) {
        const stamp = new Date().toISOString();
        const canvasMsg: BridgeMessage = {
          id: generateMessageId(),
          type: "html",
          data: `<!doctype html><html><body style="margin:0;padding:24px;font-family:system-ui;background:#111;color:#f5f5f5">Canvas ping OK<br><small>${stamp}</small></body></html>`,
        };
        await context.requireDaemonResponse(
          { method: "write", params: { channel: "canvas", msg: canvasMsg } },
          "canvas ping failed",
        );
        console.log("Canvas ping write ACK: OK");
      }

      console.log("Doctor: PASS");
    });
}
