import { describe, expect, it } from "vitest";
import { registerChannelTools } from "./tools.js";

const LIST_TOOLS_METHOD = "tools/list";
const CALL_TOOL_METHOD = "tools/call";

type MockServer = {
  setRequestHandler: (schema: unknown, handler: (request: unknown) => Promise<unknown>) => void;
};

function createMockServer() {
  const handlers = new Map<string, (request: unknown) => Promise<unknown>>();
  const server: MockServer = {
    setRequestHandler(_schema, handler) {
      if (!handlers.has(LIST_TOOLS_METHOD)) {
        handlers.set(LIST_TOOLS_METHOD, handler);
        return;
      }
      handlers.set(CALL_TOOL_METHOD, handler);
    },
  };
  return { server, handlers };
}

describe("registerChannelTools", () => {
  it("registers reply and write_canvas tools", async () => {
    const { server, handlers } = createMockServer();
    registerChannelTools(server as never, () => true);

    const listTools = handlers.get(LIST_TOOLS_METHOD);
    expect(listTools).toBeDefined();

    const result = (await listTools?.({})) as {
      tools: Array<{ name: string }>;
    };
    expect(result.tools.map((tool) => tool.name)).toEqual(["reply", "write_canvas"]);
  });

  it("returns an error when chat delivery is unavailable", async () => {
    const { server, handlers } = createMockServer();
    registerChannelTools(server as never, () => false);

    const callTool = handlers.get(CALL_TOOL_METHOD);
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

    const callTool = handlers.get(CALL_TOOL_METHOD);
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
