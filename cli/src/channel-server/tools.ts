import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { generateMessageId } from "../../../shared/bridge-protocol-core";
import type { RelayOutbound } from "../live/bridge/providers/claude-channel/relay-protocol.js";

function deliveryUnavailableError(kind: string) {
  return {
    content: [{ type: "text" as const, text: `Error: ${kind} bridge is not connected.` }],
    isError: true,
  };
}

export function registerChannelTools(
  server: Server,
  sendOutbound: (msg: RelayOutbound) => boolean,
): void {
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "reply",
        description: "Send a text reply to the user in the live chat.",
        inputSchema: {
          type: "object" as const,
          properties: {
            text: { type: "string", description: "The text message to send." },
          },
          required: ["text"],
        },
      },
      {
        name: "write_canvas",
        description:
          "Write a complete HTML document to the canvas. Must be a self-contained HTML page.",
        inputSchema: {
          type: "object" as const,
          properties: {
            html: { type: "string", description: "Complete HTML document." },
          },
          required: ["html"],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const typedArgs = (args ?? {}) as Record<string, unknown>;

    if (name === "reply") {
      const text = typedArgs.text;
      if (typeof text !== "string" || text.length === 0) {
        return { content: [{ type: "text", text: "Error: text is required." }], isError: true };
      }
      const delivered = sendOutbound({
        type: "outbound",
        channel: "chat",
        msg: { id: generateMessageId(), type: "text", data: text },
      });
      if (!delivered) return deliveryUnavailableError("chat");
      return { content: [{ type: "text", text: "Sent." }] };
    }

    if (name === "write_canvas") {
      const html = typedArgs.html;
      if (typeof html !== "string" || html.length === 0) {
        return { content: [{ type: "text", text: "Error: html is required." }], isError: true };
      }
      const delivered = sendOutbound({
        type: "outbound",
        channel: "canvas",
        msg: { id: generateMessageId(), type: "html", data: html },
      });
      if (!delivered) return deliveryUnavailableError("canvas");
      return { content: [{ type: "text", text: "Canvas updated." }] };
    }

    return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
  });
}
