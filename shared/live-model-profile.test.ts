import { describe, expect, it } from "vitest";
import {
  DEFAULT_LIVE_MODEL_PROFILE,
  readLiveModelProfile,
  resolveLiveModelProfile,
} from "./live-model-profile";

describe("live-model-profile", () => {
  it("defaults to balanced", () => {
    expect(DEFAULT_LIVE_MODEL_PROFILE).toBe("balanced");
  });

  it("reads known profiles", () => {
    expect(readLiveModelProfile("fast")).toBe("fast");
    expect(readLiveModelProfile("balanced")).toBe("balanced");
    expect(readLiveModelProfile("thorough")).toBe("thorough");
    expect(readLiveModelProfile("unknown")).toBeUndefined();
  });

  it("falls back to the default profile", () => {
    expect(resolveLiveModelProfile(undefined)).toBe("balanced");
    expect(resolveLiveModelProfile(null)).toBe("balanced");
    expect(resolveLiveModelProfile("fast")).toBe("fast");
  });
});
