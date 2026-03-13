import { describe, expect, it } from "vitest";
import { parseAgentPresenceBody, parseAgentSignalBody, parseLiveInfo } from "./live-api-core";

describe("live-api-core", () => {
  it("parses live snapshots", () => {
    expect(
      parseLiveInfo({
        slug: "demo",
        status: "active",
        browserOffer: "offer",
        agentAnswer: "answer",
        agentCandidates: [],
        browserCandidates: ["c1"],
        createdAt: 1,
        modelProfile: "thorough",
      }),
    ).toEqual({
      slug: "demo",
      status: "active",
      browserOffer: "offer",
      agentAnswer: "answer",
      agentCandidates: [],
      browserCandidates: ["c1"],
      createdAt: 1,
      modelProfile: "thorough",
    });
  });

  it("rejects malformed live snapshots", () => {
    expect(parseLiveInfo({ slug: "demo", createdAt: 1 })).toBeNull();
  });

  it("parses presence bodies", () => {
    expect(parseAgentPresenceBody({ daemonSessionId: " daemon-1 ", agentName: " Agent " })).toEqual(
      {
        ok: true,
        value: { daemonSessionId: "daemon-1", agentName: "Agent" },
      },
    );
  });

  it("validates signal bodies", () => {
    expect(
      parseAgentSignalBody({
        slug: " demo ",
        daemonSessionId: " daemon-1 ",
        answer: "answer",
        candidates: ["c1"],
      }),
    ).toEqual({
      ok: true,
      value: {
        slug: "demo",
        daemonSessionId: "daemon-1",
        answer: "answer",
        candidates: ["c1"],
        agentName: undefined,
      },
    });

    expect(parseAgentSignalBody({ slug: "demo", daemonSessionId: "x", candidates: [1] })).toEqual({
      ok: false,
      error: "Invalid candidates",
    });
  });
});
