import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchIceConfig } from "./fetch-ice-servers";

const MOCK_ICE_SERVERS = [
  {
    urls: ["stun:stun.cloudflare.com:3478", "turn:turn.cloudflare.com:3478?transport=udp"],
    username: "test-user",
    credential: "test-cred",
  },
];

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  vi.stubEnv("VITE_CONVEX_URL", "https://test-deployment.convex.cloud");
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("fetchIceConfig", () => {
  it("returns ICE config from the API", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ iceServers: MOCK_ICE_SERVERS }), { status: 200 }),
    );

    const config = await fetchIceConfig();

    expect(config.iceServers).toEqual(MOCK_ICE_SERVERS);
    expect(config.transportPolicy).toBeUndefined();
    expect(fetch).toHaveBeenCalledWith("https://test-deployment.convex.site/api/v1/ice-servers");
  });

  it("returns transportPolicy when present in response", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ iceServers: MOCK_ICE_SERVERS, transportPolicy: "relay" }), {
        status: 200,
      }),
    );

    const config = await fetchIceConfig();

    expect(config.iceServers).toEqual(MOCK_ICE_SERVERS);
    expect(config.transportPolicy).toBe("relay");
  });

  it("throws on HTTP error", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: "TURN not configured" }), { status: 503 }),
    );

    await expect(fetchIceConfig()).rejects.toThrow("ICE server request failed (503)");
  });

  it("throws on empty iceServers array", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ iceServers: [] }), { status: 200 }),
    );

    await expect(fetchIceConfig()).rejects.toThrow("ICE server response contains no servers");
  });

  it("throws when VITE_CONVEX_URL is missing", async () => {
    vi.stubEnv("VITE_CONVEX_URL", "");

    await expect(fetchIceConfig()).rejects.toThrow("Missing VITE_CONVEX_URL");
  });
});
