import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  type RelayInbound,
  defaultChannelSocketPath,
} from "../live/bridge/providers/claude-channel/relay-protocol.js";
import { createRelayServer } from "./relay.js";
import { registerChannelTools } from "./tools.js";

function log(msg: string): void {
  process.stderr.write(`[pub-channel] ${msg}\n`);
}

function notify(server: Server, content: string, meta: Record<string, string>): void {
  server
    .notification({
      method: "notifications/claude/channel",
      params: { content, meta },
    })
    .catch((err) => {
      log(`notification failed: ${err instanceof Error ? err.message : String(err)}`);
    });
}

export async function startChannelServer(opts: { socketPath?: string }): Promise<void> {
  const socketPath = opts.socketPath ?? defaultChannelSocketPath();

  const server = new Server(
    { name: "pub-live", version: "1.0.0" },
    {
      capabilities: {
        experimental: { "claude/channel": {} },
        tools: {},
      },
    },
  );

  const relay = createRelayServer({
    socketPath,
    onInbound(msg: RelayInbound) {
      if (msg.type === "briefing") {
        notify(server, msg.content, { slug: msg.slug, type: "briefing" });
      } else if (msg.type === "inbound") {
        const content =
          typeof msg.msg.data === "string" ? msg.msg.data : JSON.stringify(msg.msg);
        notify(server, content, { channel: msg.channel, messageId: msg.msg.id });
      }
    },
    onConnected() {
      log("bridge runner connected");
      notify(server, "[Bridge connected — ready to receive live messages.]", { type: "system" });
    },
    onDisconnected() {
      log("bridge runner disconnected");
      notify(server, "[Bridge disconnected.]", { type: "system" });
    },
    debugLog: log,
  });

  registerChannelTools(server, (msg) => relay.send(msg));

  await relay.listen();
  log(`relay socket listening at ${socketPath}`);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  log("MCP server connected");

  const cleanup = () => {
    relay.close().catch((err) => {
      log(`cleanup failed: ${err instanceof Error ? err.message : String(err)}`);
    });
  };
  process.on("SIGTERM", cleanup);
  process.on("SIGINT", cleanup);
}
