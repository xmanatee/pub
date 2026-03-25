import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchIceServers } from "./fetch-ice-servers";

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

describe("fetchIceServers", () => {
  it("returns ICE servers from the API", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ iceServers: MOCK_ICE_SERVERS }), { status: 200 }),
    );

    const servers = await fetchIceServers();

    expect(servers).toEqual(MOCK_ICE_SERVERS);
    expect(fetch).toHaveBeenCalledWith("https://test-deployment.convex.site/api/v1/ice-servers");
  });

  it("throws on HTTP error", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: "TURN not configured" }), { status: 503 }),
    );

    await expect(fetchIceServers()).rejects.toThrow("ICE server request failed (503)");
  });

  it("throws on empty iceServers array", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ iceServers: [] }), { status: 200 }),
    );

    await expect(fetchIceServers()).rejects.toThrow("ICE server response contains no servers");
  });

  it("throws when VITE_CONVEX_URL is missing", async () => {
    vi.stubEnv("VITE_CONVEX_URL", "");

    await expect(fetchIceServers()).rejects.toThrow("VITE_CONVEX_URL is not configured");
  });
});
