import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it } from "vitest";
import { registerChannelTools } from "./tools.js";

type MockServer = {
  setRequestHandler: (schema: { method: string }, handler: (request: unknown) => Promise<unknown>) => void;
};

function createMockServer() {
  const handlers = new Map<string, (request: unknown) => Promise<unknown>>();
  const server: MockServer = {
    setRequestHandler(schema, handler) {
      handlers.set(schema.method, handler);
    },
  };
  return { server, handlers };
}

describe("registerChannelTools", () => {
  it("registers reply and write_canvas tools", async () => {
    const { server, handlers } = createMockServer();
    registerChannelTools(server as never, () => true);

    const listTools = handlers.get(ListToolsRequestSchema.method);
    expect(listTools).toBeDefined();

    const result = (await listTools?.({})) as {
      tools: Array<{ name: string }>;
    };
    expect(result.tools.map((tool) => tool.name)).toEqual(["reply", "write_canvas"]);
  });

  it("returns an error when chat delivery is unavailable", async () => {
    const { server, handlers } = createMockServer();
    registerChannelTools(server as never, () => false);

    const callTool = handlers.get(CallToolRequestSchema.method);
    const result = (await callTool?.({
      params: { name: "reply", arguments: { text: "hello" } },
    })) as {
      isError?: boolean;
      content: Array<{ text: string }>;
    };

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("chat bridge is not connected");
  });

  it("returns an error when canvas delivery is unavailable", async () => {
    const { server, handlers } = createMockServer();
    registerChannelTools(server as never, () => false);

    const callTool = handlers.get(CallToolRequestSchema.method);
    const result = (await callTool?.({
      params: { name: "write_canvas", arguments: { html: "<html></html>" } },
    })) as {
      isError?: boolean;
      content: Array<{ text: string }>;
    };

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("canvas bridge is not connected");
  });
});
