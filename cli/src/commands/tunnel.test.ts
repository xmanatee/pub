import { describe, expect, it } from "vitest";
import {
  buildDaemonForkStdio,
  getFollowReadDelayMs,
  pickReusableTunnel,
  resolveTunnelIdSelection,
} from "./tunnel.js";

describe("getFollowReadDelayMs", () => {
  it("uses steady polling when daemon is reachable", () => {
    expect(getFollowReadDelayMs(false, 0)).toBe(1_000);
    expect(getFollowReadDelayMs(false, 3)).toBe(1_000);
  });

  it("backs off exponentially when disconnected", () => {
    expect(getFollowReadDelayMs(true, 1)).toBe(2_000);
    expect(getFollowReadDelayMs(true, 2)).toBe(4_000);
    expect(getFollowReadDelayMs(true, 3)).toBe(5_000);
    expect(getFollowReadDelayMs(true, 10)).toBe(5_000);
  });
});

describe("resolveTunnelIdSelection", () => {
  it("prefers --tunnel over positional tunnelId", () => {
    expect(resolveTunnelIdSelection("arg-id", "opt-id")).toBe("opt-id");
  });

  it("uses positional tunnelId when --tunnel is omitted", () => {
    expect(resolveTunnelIdSelection("arg-id", undefined)).toBe("arg-id");
  });

  it("returns undefined when neither source provides tunnelId", () => {
    expect(resolveTunnelIdSelection(undefined, undefined)).toBeUndefined();
  });
});

describe("buildDaemonForkStdio", () => {
  it("includes required IPC channel for fork", () => {
    expect(buildDaemonForkStdio(7)).toEqual(["ignore", 7, 7, "ipc"]);
  });
});

describe("pickReusableTunnel", () => {
  const now = Date.UTC(2026, 1, 28, 0, 0, 0);

  it("returns the only active tunnel", () => {
    const tunnel = pickReusableTunnel(
      [
        {
          tunnelId: "abc12345",
          status: "active",
          hasConnection: false,
          createdAt: now - 1_000,
          expiresAt: now + 60_000,
        },
      ],
      now,
    );
    expect(tunnel?.tunnelId).toBe("abc12345");
  });

  it("returns most recent active tunnel when there are multiple active tunnels", () => {
    const tunnel = pickReusableTunnel(
      [
        {
          tunnelId: "abc12345",
          status: "active",
          hasConnection: false,
          createdAt: now - 2_000,
          expiresAt: now + 60_000,
        },
        {
          tunnelId: "def67890",
          status: "active",
          hasConnection: false,
          createdAt: now - 1_000,
          expiresAt: now + 60_000,
        },
      ],
      now,
    );
    expect(tunnel?.tunnelId).toBe("def67890");
  });

  it("returns null when only closed or expired tunnels exist", () => {
    const tunnel = pickReusableTunnel(
      [
        {
          tunnelId: "closed111",
          status: "closed",
          hasConnection: false,
          createdAt: now - 2_000,
          expiresAt: now + 60_000,
        },
        {
          tunnelId: "expired22",
          status: "active",
          hasConnection: false,
          createdAt: now - 2_000,
          expiresAt: now - 1,
        },
      ],
      now,
    );
    expect(tunnel).toBeNull();
  });
});
