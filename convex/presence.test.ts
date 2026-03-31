import { describe, expect, it } from "vitest";
import type { Id } from "./_generated/dataModel";
import { HOST_STALENESS_THRESHOLD_MS, isFreshHost, listFreshOnlineHosts } from "./presence";

const THRESHOLD = HOST_STALENESS_THRESHOLD_MS;

describe("isFreshHost", () => {
  it("returns true when heartbeat is within threshold", () => {
    expect(isFreshHost({ lastHeartbeatAt: 1000 }, 1000 + THRESHOLD - 1)).toBe(true);
  });

  it("returns false when heartbeat is exactly at threshold", () => {
    expect(isFreshHost({ lastHeartbeatAt: 1000 }, 1000 + THRESHOLD)).toBe(false);
  });

  it("returns false when heartbeat is beyond threshold", () => {
    expect(isFreshHost({ lastHeartbeatAt: 1000 }, 1000 + THRESHOLD + 1)).toBe(false);
  });

  it("returns true for zero-age heartbeat", () => {
    expect(isFreshHost({ lastHeartbeatAt: 5000 }, 5000)).toBe(true);
  });
});

describe("listFreshOnlineHosts", () => {
  const id = (n: number) => `host_${n}` as unknown as Id<"hosts">;

  it("filters out offline hosts", () => {
    const hosts = [
      { _id: id(1), status: "online" as const, lastHeartbeatAt: 100, agentName: "a" },
      { _id: id(2), status: "offline" as const, lastHeartbeatAt: 100, agentName: "b" },
    ];
    const result = listFreshOnlineHosts(hosts, 100);
    expect(result).toHaveLength(1);
    expect(result[0]._id).toBe(id(1));
  });

  it("filters out stale hosts", () => {
    const now = 200_000;
    const hosts = [
      { _id: id(1), status: "online" as const, lastHeartbeatAt: now - THRESHOLD + 1 },
      { _id: id(2), status: "online" as const, lastHeartbeatAt: now - THRESHOLD - 1 },
    ];
    const result = listFreshOnlineHosts(hosts, now);
    expect(result).toHaveLength(1);
    expect(result[0]._id).toBe(id(1));
  });

  it("sorts freshest first", () => {
    const now = 100_000;
    const hosts = [
      { _id: id(1), status: "online" as const, lastHeartbeatAt: now - 5000 },
      { _id: id(2), status: "online" as const, lastHeartbeatAt: now - 1000 },
      { _id: id(3), status: "online" as const, lastHeartbeatAt: now - 3000 },
    ];
    const result = listFreshOnlineHosts(hosts, now);
    expect(result.map((h) => h._id)).toEqual([id(2), id(3), id(1)]);
  });

  it("returns empty array when all hosts are stale or offline", () => {
    const now = 200_000;
    const hosts = [
      { _id: id(1), status: "offline" as const, lastHeartbeatAt: now },
      { _id: id(2), status: "online" as const, lastHeartbeatAt: now - THRESHOLD },
    ];
    expect(listFreshOnlineHosts(hosts, now)).toEqual([]);
  });
});
