import { describe, expect, it } from "vitest";
import { getFollowReadDelayMs } from "./tunnel.js";

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
