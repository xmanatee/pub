import { describe, expect, it } from "vitest";
import {
  type AgentAnswerPeer,
  type BrowserOfferPeer,
  createAgentAnswerFromBrowserOffer,
  createBrowserOffer,
  encodeSessionDescription,
  parseSessionDescription,
  type SessionDescriptionPayload,
} from "./webrtc-negotiation-core";

function json(value: SessionDescriptionPayload): string {
  return JSON.stringify(value);
}

describe("parseSessionDescription", () => {
  it("parses valid json payload", () => {
    expect(parseSessionDescription(json({ sdp: "v=0", type: "offer" }))).toEqual({
      sdp: "v=0",
      type: "offer",
    });
  });

  it("throws on invalid json", () => {
    expect(() => parseSessionDescription("{not-json", "Offer")).toThrow("Offer is not valid JSON");
  });

  it("throws when fields are missing", () => {
    expect(() => parseSessionDescription(json({ sdp: "", type: "offer" }))).toThrow(
      "Session description must include a non-empty sdp",
    );
    expect(() => parseSessionDescription(json({ sdp: "v=0", type: "" }))).toThrow(
      "Session description must include a non-empty type",
    );
  });
});

describe("createBrowserOffer", () => {
  it("uses applied local description when available", async () => {
    const peer: BrowserOfferPeer = {
      createOffer: async () => ({ sdp: "offer-created", type: "offer" }),
      setLocalDescription: async () => {},
      getLocalDescription: () => ({ sdp: "offer-local", type: "offer" }),
    };

    await expect(createBrowserOffer(peer)).resolves.toBe(
      json({ sdp: "offer-local", type: "offer" }),
    );
  });

  it("falls back to createOffer result when local description is unavailable", async () => {
    const peer: BrowserOfferPeer = {
      createOffer: async () => ({ sdp: "offer-created", type: "offer" }),
      setLocalDescription: async () => {},
      getLocalDescription: () => null,
    };

    await expect(createBrowserOffer(peer)).resolves.toBe(
      json({ sdp: "offer-created", type: "offer" }),
    );
  });
});

describe("createAgentAnswerFromBrowserOffer", () => {
  it("keeps browser offer / daemon answer wire format compatible", async () => {
    const browserPeer: BrowserOfferPeer = {
      createOffer: async () => ({ sdp: "offer-sdp", type: "offer" }),
      setLocalDescription: async () => {},
      getLocalDescription: () => ({ sdp: "offer-sdp", type: "offer" }),
    };
    const browserOffer = await createBrowserOffer(browserPeer);

    let onLocalDescription: ((sdp: string, type: string) => void) | null = null;
    const daemonPeer: AgentAnswerPeer = {
      setRemoteDescription: (sdp, type) => {
        expect(sdp).toBe("offer-sdp");
        expect(type).toBe("offer");
        onLocalDescription?.("answer-sdp", "answer");
      },
      onLocalDescription: (cb) => {
        onLocalDescription = cb;
      },
      onGatheringStateChange: () => {},
      getLocalDescription: () => null,
    };

    await expect(createAgentAnswerFromBrowserOffer(daemonPeer, browserOffer, 100)).resolves.toBe(
      json({ sdp: "answer-sdp", type: "answer" }),
    );
  });

  it("resolves when peer emits local description callback", async () => {
    let onLocalDescription: ((sdp: string, type: string) => void) | null = null;
    let onGatheringStateChange: ((state: string) => void) | null = null;

    const peer: AgentAnswerPeer = {
      setRemoteDescription: () => {
        onLocalDescription?.("answer-sdp", "answer");
      },
      onLocalDescription: (cb) => {
        onLocalDescription = cb;
      },
      onGatheringStateChange: (cb) => {
        onGatheringStateChange = cb;
      },
      getLocalDescription: () => null,
    };

    const answer = await createAgentAnswerFromBrowserOffer(
      peer,
      json({ sdp: "offer-sdp", type: "offer" }),
      100,
    );

    expect(answer).toBe(json({ sdp: "answer-sdp", type: "answer" }));
    expect(onGatheringStateChange).not.toBeNull();
  });

  it("uses gathered local description on complete event", async () => {
    let onGatheringStateChange: ((state: string) => void) | null = null;
    const peer: AgentAnswerPeer = {
      setRemoteDescription: () => {
        onGatheringStateChange?.("complete");
      },
      onLocalDescription: () => {},
      onGatheringStateChange: (cb) => {
        onGatheringStateChange = cb;
      },
      getLocalDescription: () => ({ sdp: "answer-gathered", type: "answer" }),
    };

    await expect(
      createAgentAnswerFromBrowserOffer(peer, json({ sdp: "offer-sdp", type: "offer" }), 100),
    ).resolves.toBe(json({ sdp: "answer-gathered", type: "answer" }));
  });

  it("falls back to timeout local description when callback did not fire", async () => {
    const peer: AgentAnswerPeer = {
      setRemoteDescription: () => {},
      onLocalDescription: () => {},
      onGatheringStateChange: () => {},
      getLocalDescription: () => ({ sdp: "answer-timeout", type: "answer" }),
    };

    await expect(
      createAgentAnswerFromBrowserOffer(peer, json({ sdp: "offer-sdp", type: "offer" }), 10),
    ).resolves.toBe(json({ sdp: "answer-timeout", type: "answer" }));
  });

  it("rejects on timeout when local description is still missing", async () => {
    const peer: AgentAnswerPeer = {
      setRemoteDescription: () => {},
      onLocalDescription: () => {},
      onGatheringStateChange: () => {},
      getLocalDescription: () => null,
    };

    await expect(
      createAgentAnswerFromBrowserOffer(
        peer,
        encodeSessionDescription({ sdp: "offer", type: "offer" }),
        5,
      ),
    ).rejects.toThrow("Timed out after 5ms");
  });
});
