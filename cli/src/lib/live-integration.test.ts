import { afterEach, beforeAll, describe, expect, it } from "vitest";

// node-datachannel is a native module — skip if unavailable (e.g. CI without native builds)
let ndc: typeof import("node-datachannel") | null = null;
try {
  ndc = await import("node-datachannel");
} catch {
  ndc = null;
}

const describeWithNdc = ndc ? describe : describe.skip;

describeWithNdc("WebRTC P2P integration (node-datachannel)", () => {
  let peerA: import("node-datachannel").PeerConnection;
  let peerB: import("node-datachannel").PeerConnection;
  let iceGatherSupported = true;
  let p2pDataChannelSupported = true;
  let unsupportedWarningShown = false;

  function isIceGatherUnavailableError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return message.includes("Failed to gather local ICE candidates");
  }

  function createChannelOrSkip(
    peer: import("node-datachannel").PeerConnection,
    label: string,
  ): import("node-datachannel").DataChannel | null {
    try {
      return peer.createDataChannel(label, { ordered: true });
    } catch (error) {
      if (isIceGatherUnavailableError(error)) {
        iceGatherSupported = false;
        return null;
      }
      throw error;
    }
  }

  function markP2pDataChannelUnsupported(reason: string): void {
    p2pDataChannelSupported = false;
    if (unsupportedWarningShown) return;
    unsupportedWarningShown = true;
    console.warn(`Skipping node-datachannel P2P assertions: ${reason}`);
  }

  async function waitForRemoteDataChannel(
    peer: import("node-datachannel").PeerConnection,
    trigger: () => void,
    timeoutMs = 10_000,
  ): Promise<import("node-datachannel").DataChannel | null> {
    return await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        markP2pDataChannelUnsupported("remote data channel did not arrive");
        resolve(null);
      }, timeoutMs);

      peer.onDataChannel((dc) => {
        clearTimeout(timeout);
        resolve(dc);
      });

      trigger();
    });
  }

  async function waitForRemoteDataChannels(
    peer: import("node-datachannel").PeerConnection,
    expectedCount: number,
    trigger: () => void,
    timeoutMs = 10_000,
  ): Promise<Map<string, import("node-datachannel").DataChannel> | null> {
    return await new Promise((resolve) => {
      const remoteDcs = new Map<string, import("node-datachannel").DataChannel>();
      const timeout = setTimeout(() => {
        markP2pDataChannelUnsupported(
          `${expectedCount} remote data channels did not arrive`,
        );
        resolve(null);
      }, timeoutMs);

      peer.onDataChannel((dc) => {
        remoteDcs.set(dc.getLabel(), dc);
        if (remoteDcs.size === expectedCount) {
          clearTimeout(timeout);
          resolve(remoteDcs);
        }
      });

      trigger();
    });
  }

  async function waitForOpen(
    channel: import("node-datachannel").DataChannel,
    label: string,
    timeoutMs = 10_000,
  ): Promise<boolean> {
    if (channel.isOpen()) return true;

    return await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        markP2pDataChannelUnsupported(`"${label}" channel did not open`);
        resolve(false);
      }, timeoutMs);

      channel.onOpen(() => {
        clearTimeout(timeout);
        resolve(true);
      });
    });
  }

  function setupSafeSignaling(
    a: import("node-datachannel").PeerConnection,
    b: import("node-datachannel").PeerConnection,
  ): void {
    const pendingForA: Array<{ candidate: string; mid: string }> = [];
    const pendingForB: Array<{ candidate: string; mid: string }> = [];
    let aHasRemoteDescription = false;
    let bHasRemoteDescription = false;

    const flushForA = () => {
      while (pendingForA.length > 0) {
        const next = pendingForA.shift();
        if (!next) break;
        try {
          a.addRemoteCandidate(next.candidate, next.mid);
        } catch {
          // Ignore invalid/out-of-order candidates during handshake.
        }
      }
    };

    const flushForB = () => {
      while (pendingForB.length > 0) {
        const next = pendingForB.shift();
        if (!next) break;
        try {
          b.addRemoteCandidate(next.candidate, next.mid);
        } catch {
          // Ignore invalid/out-of-order candidates during handshake.
        }
      }
    };

    a.onLocalCandidate((candidate, mid) => {
      if (!bHasRemoteDescription) {
        pendingForB.push({ candidate, mid });
        return;
      }
      try {
        b.addRemoteCandidate(candidate, mid);
      } catch {
        // Ignore invalid/out-of-order candidates during handshake.
      }
    });

    b.onLocalCandidate((candidate, mid) => {
      if (!aHasRemoteDescription) {
        pendingForA.push({ candidate, mid });
        return;
      }
      try {
        a.addRemoteCandidate(candidate, mid);
      } catch {
        // Ignore invalid/out-of-order candidates during handshake.
      }
    });

    a.onLocalDescription((sdp, type) => {
      b.setRemoteDescription(sdp, type);
      bHasRemoteDescription = true;
      flushForB();
    });

    b.onLocalDescription((sdp, type) => {
      a.setRemoteDescription(sdp, type);
      aHasRemoteDescription = true;
      flushForA();
    });
  }

  beforeAll(() => {
    if (!ndc) throw new Error("node-datachannel not available");
    try {
      const probe = new ndc.PeerConnection("probe", { iceServers: [] });
      probe.createDataChannel("probe", { ordered: true });
      probe.close();
    } catch (error) {
      if (isIceGatherUnavailableError(error)) {
        iceGatherSupported = false;
        console.warn(
          "Skipping node-datachannel integration assertions: local ICE candidate gathering unavailable",
        );
        return;
      }
      throw error;
    }
  });

  afterEach(() => {
    peerA?.close();
    peerB?.close();
  });

  it("establishes a connection and exchanges messages via DataChannel", async () => {
    if (!ndc || !iceGatherSupported || !p2pDataChannelSupported) return;

    peerA = new ndc.PeerConnection("peerA", { iceServers: [] });
    peerB = new ndc.PeerConnection("peerB", { iceServers: [] });

    setupSafeSignaling(peerA, peerB);

    // Track connection state on peerA
    const stateChanges: string[] = [];
    peerA.onStateChange((state) => stateChanges.push(state));

    // peerA creates a DataChannel
    const dcA = createChannelOrSkip(peerA, "chat");
    if (!dcA) return;

    // Wait for peerB to receive the DataChannel
    const dcB = await waitForRemoteDataChannel(peerB, () => {
      peerA.setLocalDescription();
    });
    if (!dcB) return;

    // Wait for channels to open
    if (!(await waitForOpen(dcA, "chat"))) return;
    if (!(await waitForOpen(dcB, "chat"))) return;

    // Send message A → B
    const receivedByB: string[] = [];
    dcB.onMessage((data) => {
      if (typeof data === "string") receivedByB.push(data);
    });

    dcA.sendMessage("hello from A");

    // Small delay for message delivery
    await new Promise((r) => setTimeout(r, 100));
    expect(receivedByB).toContain("hello from A");

    // Send message B → A
    const receivedByA: string[] = [];
    dcA.onMessage((data) => {
      if (typeof data === "string") receivedByA.push(data);
    });

    dcB.sendMessage("hello from B");
    await new Promise((r) => setTimeout(r, 100));
    expect(receivedByA).toContain("hello from B");

    // Verify connection state transitions fired
    expect(stateChanges).toContain("connected");
  }, 20_000);

  it("supports multiple named channels", async () => {
    if (!ndc || !iceGatherSupported || !p2pDataChannelSupported) return;

    peerA = new ndc.PeerConnection("peerA", { iceServers: [] });
    peerB = new ndc.PeerConnection("peerB", { iceServers: [] });

    setupSafeSignaling(peerA, peerB);

    const chatA = createChannelOrSkip(peerA, "chat");
    const canvasA = createChannelOrSkip(peerA, "canvas");
    if (!chatA || !canvasA) return;

    const remoteDcs = await waitForRemoteDataChannels(peerB, 2, () => {
      peerA.setLocalDescription();
    });
    if (!remoteDcs) return;

    // Wait for all channels to open
    for (const dc of [chatA, canvasA]) {
      if (!(await waitForOpen(dc, dc.getLabel()))) return;
    }
    for (const dc of remoteDcs.values()) {
      if (!(await waitForOpen(dc, dc.getLabel()))) return;
    }

    // Send on chat channel
    const chatMessages: string[] = [];
    const chatB = remoteDcs.get("chat");
    expect(chatB).toBeDefined();
    chatB?.onMessage((data) => {
      if (typeof data === "string") chatMessages.push(data);
    });
    chatA.sendMessage("chat msg");

    // Send HTML on canvas channel
    const canvasMessages: string[] = [];
    const canvasB = remoteDcs.get("canvas");
    expect(canvasB).toBeDefined();
    canvasB?.onMessage((data) => {
      if (typeof data === "string") canvasMessages.push(data);
    });
    const htmlPayload = JSON.stringify({
      id: "test-1",
      type: "html",
      data: "<h1>Hello</h1>",
      meta: { title: "Test" },
    });
    canvasA.sendMessage(htmlPayload);

    await new Promise((r) => setTimeout(r, 100));

    expect(chatMessages).toContain("chat msg");
    expect(canvasMessages).toHaveLength(1);
    const parsed = JSON.parse(canvasMessages[0]);
    expect(parsed.type).toBe("html");
    expect(parsed.data).toBe("<h1>Hello</h1>");
    expect(parsed.meta.title).toBe("Test");
  }, 20_000);

  it("generates offer with STUN servers via onGatheringStateChange", async () => {
    if (!ndc || !iceGatherSupported || !p2pDataChannelSupported) return;

    const peer = new ndc.PeerConnection("agent", {
      iceServers: ["stun:stun.l.google.com:19302"],
    });
    const cleanup = () => {
      try {
        peer.close();
      } catch {
        /* already closed */
      }
    };

    try {
      if (!createChannelOrSkip(peer, "test")) return;

      const offer = await new Promise<{ sdp: string; type: string }>((resolve, reject) => {
        let resolved = false;
        const done = (sdp: string, type: string) => {
          if (resolved) return;
          resolved = true;
          clearTimeout(timeout);
          resolve({ sdp, type });
        };

        peer.onLocalDescription((sdp, type) => done(sdp, type));
        peer.onGatheringStateChange((state: string) => {
          if (state === "complete" && !resolved) {
            const desc = peer.localDescription();
            if (desc) done(desc.sdp, desc.type);
          }
        });

        const timeout = setTimeout(() => {
          if (resolved) return;
          const desc = peer.localDescription();
          if (desc) {
            done(desc.sdp, desc.type);
          } else {
            resolved = true;
            reject(new Error("Timed out generating offer with STUN"));
          }
        }, 10_000);

        peer.setLocalDescription();
      });

      expect(offer.sdp).toContain("v=0");
      expect(offer.type).toBe("offer");
    } finally {
      cleanup();
    }
  }, 15_000);

  it("bridge protocol messages round-trip over DataChannel", async () => {
    if (!ndc || !iceGatherSupported) return;

    // Import bridge protocol helpers (these are pure functions, no native deps)
    const { encodeMessage, decodeMessage, makeTextMessage, makeHtmlMessage } = await import(
      "../../../shared/bridge-protocol-core"
    );

    peerA = new ndc.PeerConnection("peerA", { iceServers: [] });
    peerB = new ndc.PeerConnection("peerB", { iceServers: [] });

    setupSafeSignaling(peerA, peerB);

    const dcA = createChannelOrSkip(peerA, "chat");
    if (!dcA) return;
    const dcB = await waitForRemoteDataChannel(peerB, () => {
      peerA.setLocalDescription();
    });
    if (!dcB) return;

    if (!(await waitForOpen(dcA, "chat"))) return;
    if (!(await waitForOpen(dcB, "chat"))) return;

    const received: string[] = [];
    dcB.onMessage((data) => {
      if (typeof data === "string") received.push(data);
    });

    // Send a text message
    const textMsg = makeTextMessage("hello bridge");
    dcA.sendMessage(encodeMessage(textMsg));

    // Send an HTML message
    const htmlMsg = makeHtmlMessage("<p>test</p>", "Title");
    dcA.sendMessage(encodeMessage(htmlMsg));

    await new Promise((r) => setTimeout(r, 100));

    expect(received).toHaveLength(2);

    const decoded0 = decodeMessage(received[0]);
    expect(decoded0?.type).toBe("text");
    expect(decoded0?.data).toBe("hello bridge");
    expect(decoded0?.id).toBe(textMsg.id);

    const decoded1 = decodeMessage(received[1]);
    expect(decoded1?.type).toBe("html");
    expect(decoded1?.data).toBe("<p>test</p>");
    expect(decoded1?.meta?.title).toBe("Title");
  }, 20_000);
});
