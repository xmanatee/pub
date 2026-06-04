import { afterEach, describe, expect, it, vi } from "vitest";
import { type Env, handleTunnelProxyRoute } from "./src/index";

function mockTunnelEnv(response: Response) {
  const stub = { fetch: vi.fn(async () => response) };
  const env = {
    CONVEX_SITE_URL: "https://convex.example",
    TUNNEL: {
      idFromName: vi.fn(() => "do-id"),
      get: vi.fn(() => stub),
    },
  } as unknown as Env;
  return { env, stub };
}

function stubTunnelValidation() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        userId: "user-id",
        hostId: "host-id",
      }),
    ),
  );
}

describe("handleTunnelProxyRoute", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns websocket upgrade responses directly from the durable object", async () => {
    stubTunnelValidation();
    const durableObjectResponse = new Response("upgrade-ok", {
      headers: { "x-durable-object": "yes" },
    });
    const { env, stub } = mockTunnelEnv(durableObjectResponse);
    const url = new URL("https://relay.example/t/session-id/?token=vite-hmr-token");

    const response = await handleTunnelProxyRoute(
      new Request(url, { headers: { Upgrade: "websocket" } }),
      url,
      env,
    );

    expect(response).toBe(durableObjectResponse);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    const forwardedRequest = stub.fetch.mock.calls[0]?.[0] as Request;
    expect(forwardedRequest.headers.get("Upgrade")).toBe("websocket");
  });

  it("adds CORS headers for normal HTTP proxy responses", async () => {
    stubTunnelValidation();
    const { env } = mockTunnelEnv(new Response("ok"));
    const url = new URL("https://relay.example/t/session-id/");

    const response = await handleTunnelProxyRoute(new Request(url), url, env);

    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    await expect(response.text()).resolves.toBe("ok");
  });
});
