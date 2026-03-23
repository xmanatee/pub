import type { Id } from "@backend/_generated/dataModel";
import { describe, expect, it } from "vitest";
import { resolveSelectedHost } from "./agent-selection";

function hostId(n: number): Id<"hosts"> {
  return `host-${n}` as Id<"hosts">;
}

function agent(n: number, name?: string) {
  return { hostId: hostId(n), agentName: name ?? `Agent ${n}` };
}

describe("resolveSelectedHost", () => {
  it("returns null when no agents are available", () => {
    expect(resolveSelectedHost([], null, null)).toBe(null);
  });

  it("returns null when no agents available even with a default set", () => {
    expect(resolveSelectedHost([], null, "Agent 1")).toBe(null);
  });

  it("auto-selects the single available agent", () => {
    expect(resolveSelectedHost([agent(1)], null, null)).toBe(hostId(1));
  });

  it("auto-selects the single available agent even when it does not match the default", () => {
    expect(resolveSelectedHost([agent(1)], null, "Other Agent")).toBe(hostId(1));
  });

  it("keeps current selection when it is still available", () => {
    const agents = [agent(1), agent(2)];
    expect(resolveSelectedHost(agents, hostId(1), null)).toBe(hostId(1));
  });

  it("keeps current selection over default when both are available", () => {
    const agents = [agent(1), agent(2)];
    expect(resolveSelectedHost(agents, hostId(1), "Agent 2")).toBe(hostId(1));
  });

  it("returns null for multiple agents with no selection and no default", () => {
    const agents = [agent(1), agent(2)];
    expect(resolveSelectedHost(agents, null, null)).toBe(null);
  });

  it("selects the default agent by name when multiple agents are available", () => {
    const agents = [agent(1), agent(2), agent(3)];
    expect(resolveSelectedHost(agents, null, "Agent 2")).toBe(hostId(2));
  });

  it("returns null when default name does not match any available agent", () => {
    const agents = [agent(1), agent(2)];
    expect(resolveSelectedHost(agents, null, "Deleted Agent")).toBe(null);
  });

  it("falls back to default when current selection goes offline", () => {
    const agents = [agent(2), agent(3)];
    expect(resolveSelectedHost(agents, hostId(1), "Agent 3")).toBe(hostId(3));
  });

  it("returns null when current selection goes offline and default is also offline", () => {
    const agents = [agent(2), agent(3)];
    expect(resolveSelectedHost(agents, hostId(1), "Agent 1")).toBe(null);
  });

  it("handles duplicate agent names by selecting the first match", () => {
    const agents = [
      { hostId: hostId(1), agentName: "Shared" },
      { hostId: hostId(2), agentName: "Shared" },
    ];
    expect(resolveSelectedHost(agents, null, "Shared")).toBe(hostId(1));
  });
});
