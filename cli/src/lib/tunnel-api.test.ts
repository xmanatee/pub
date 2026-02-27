import { beforeEach, describe, expect, it, vi } from "vitest";
import { TunnelApiClient } from "./tunnel-api.js";

describe("TunnelApiClient", () => {
  const baseUrl = "https://test.convex.site";
  const apiKey = "pub_test123";
  let client: TunnelApiClient;

  beforeEach(() => {
    client = new TunnelApiClient(baseUrl, apiKey);
    vi.restoreAllMocks();
  });

  it("uses trailing-slash endpoint for list requests", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ tunnels: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const tunnels = await client.list();
    expect(tunnels).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, options] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toBe(new URL("/api/v1/tunnels/", baseUrl).toString());
    expect(options).toEqual(
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        }),
      }),
    );
  });

  it("throws server error message when request fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Tunnel not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(client.get("abc123")).rejects.toThrow("Tunnel not found");
  });

  it("sends signaling payloads to /signal endpoint", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await client.signal("abc123", { offer: "offer-sdp" });

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, options] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toBe(new URL("/api/v1/tunnels/abc123/signal", baseUrl).toString());
    expect(options).toEqual(
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ offer: "offer-sdp" }),
      }),
    );
  });
});
