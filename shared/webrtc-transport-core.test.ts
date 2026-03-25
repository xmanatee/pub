import { describe, expect, it } from "vitest";
import { type IceServer, normalizeIceServers } from "./webrtc-transport-core";

describe("normalizeIceServers", () => {
  it("passes through stun-only servers unchanged", () => {
    const input: IceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
    expect(normalizeIceServers(input)).toEqual(input);
  });

  it("passes through turn servers with credentials", () => {
    const input: IceServer[] = [
      { urls: "turn:relay.example.com:3478", username: "u", credential: "p" },
    ];
    expect(normalizeIceServers(input)).toEqual(input);
  });

  it("filters out turns: URLs from mixed entries", () => {
    const input: IceServer[] = [
      {
        urls: [
          "turn:turn.cloudflare.com:3478?transport=udp",
          "turn:turn.cloudflare.com:3478?transport=tcp",
          "turns:turn.cloudflare.com:5349?transport=tcp",
          "turns:turn.cloudflare.com:443?transport=tcp",
        ],
        username: "user",
        credential: "pass",
      },
    ];
    expect(normalizeIceServers(input)).toEqual([
      {
        urls: [
          "turn:turn.cloudflare.com:3478?transport=udp",
          "turn:turn.cloudflare.com:3478?transport=tcp",
        ],
        username: "user",
        credential: "pass",
      },
    ]);
  });

  it("drops entries that are entirely turns:", () => {
    const input: IceServer[] = [
      { urls: "turns:turn.example.com:443", username: "u", credential: "p" },
      { urls: "stun:stun.example.com:3478" },
    ];
    expect(normalizeIceServers(input)).toEqual([{ urls: "stun:stun.example.com:3478" }]);
  });

  it("handles the full Cloudflare TURN API response format", () => {
    const cloudflareResponse: IceServer[] = [
      { urls: ["stun:stun.cloudflare.com:3478", "stun:stun.cloudflare.com:53"] },
      {
        urls: [
          "turn:turn.cloudflare.com:3478?transport=udp",
          "turn:turn.cloudflare.com:3478?transport=tcp",
          "turns:turn.cloudflare.com:5349?transport=tcp",
          "turn:turn.cloudflare.com:53?transport=udp",
          "turn:turn.cloudflare.com:80?transport=tcp",
          "turns:turn.cloudflare.com:443?transport=tcp",
        ],
        username: "cf-user",
        credential: "cf-cred",
      },
    ];
    const result = normalizeIceServers(cloudflareResponse);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      urls: ["stun:stun.cloudflare.com:3478", "stun:stun.cloudflare.com:53"],
    });
    const turnEntry = result[1];
    expect(turnEntry.username).toBe("cf-user");
    expect(turnEntry.credential).toBe("cf-cred");
    const turnUrls = turnEntry.urls as string[];
    expect(turnUrls.every((u) => !u.startsWith("turns:"))).toBe(true);
    expect(turnUrls).toHaveLength(4);
  });

  it("collapses single-element arrays to string", () => {
    const input: IceServer[] = [{ urls: ["stun:stun.example.com:3478"] }];
    expect(normalizeIceServers(input)).toEqual([{ urls: "stun:stun.example.com:3478" }]);
  });

  it("returns empty array for empty input", () => {
    expect(normalizeIceServers([])).toEqual([]);
  });

  it("drops entries with only unsupported protocols", () => {
    const input: IceServer[] = [
      { urls: ["turns:a.com:443", "turns:b.com:443"], username: "u", credential: "p" },
    ];
    expect(normalizeIceServers(input)).toEqual([]);
  });
});
