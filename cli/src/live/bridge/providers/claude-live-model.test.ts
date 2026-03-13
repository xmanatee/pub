import { describe, expect, it } from "vitest";
import { resolveClaudeLiveModel } from "./claude-live-model.js";

describe("resolveClaudeLiveModel", () => {
  it("maps profiles to Claude model aliases", () => {
    expect(resolveClaudeLiveModel("fast")).toBe("haiku");
    expect(resolveClaudeLiveModel("balanced")).toBe("sonnet");
    expect(resolveClaudeLiveModel("thorough")).toBe("opus");
  });
});
