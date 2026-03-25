import * as dgram from "node:dgram";
import { afterEach, describe, expect, it } from "vitest";
import {
  type AdapterDataChannel,
  type AdapterPeerConnection,
  createPeerConnection,
} from "./webrtc-adapter.js";

const PEER_EVENT_TIMEOUT_MS = 7_500;
const PEER_NEGOTIATION_TIMEOUT_MS = 25_000;
const LOOPBACK_PEER_CONFIG = {
  iceServers: [],
  iceAdditionalHostAddresses: ["127.0.0.1"],
  iceUseIpv6: false,
} as const;
const STUN_LOOPBACK_PEER_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
  iceAdditionalHostAddresses: ["127.0.0.1"],
  iceUseIpv6: false,
} as const;

async function canBindUdpSocket(): Promise<boolean> {
  return await new Promise<boolean>((resolve) => {
    const socket = dgram.createSocket("udp4");
    let settled = false;

    const finish = (result: boolean) => {
      if (settled) return;
      settled = true;
      try {
        socket.close();
      } catch {
        /* ignore close failures during preflight */
      }
      resolve(result);
    };

    socket.once("error", () => finish(false));
    socket.bind(0, "127.0.0.1", () => finish(true));
  });
}

const describeWebRtc = (await canBindUdpSocket()) ? describe : describe.skip;

function waitForPeerEvent<T>(
  subscribe: (resolve: (value: T) => void) => void,
  timeoutMs = PEER_EVENT_TIMEOUT_MS,
  label = "peer event",
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timed out waiting for ${label}`));
    }, timeoutMs);

    subscribe((value) => {
      clearTimeout(timeout);
      resolve(value);
    });
  });
}

describeWebRtc("WebRTC P2P integration (werift adapter)", () => {
  let peerA: AdapterPeerConnection;
  let peerB: AdapterPeerConnection;

  function setupSafeSignaling(a: AdapterPeerConnection, b: AdapterPeerConnection): void {
    const pendingForA: Array<{ candidate: string; mid: string }> = [];
    const pendingForB: Array<{ candidate: string; mid: string }> = [];
    let aHasRemoteDescription = false;
    let bHasRemoteDescription = false;

    const flushForA = () => {
      while (pendingForA.length > 0) {
        const next = pendingForA.shift();
        if (!next) break;
        void a.addRemoteCandidate(next.candidate, next.mid).catch(() => {
          // Ignore invalid/out-of-order candidates during handshake.
        });
      }
    };

    const flushForB = () => {
      while (pendingForB.length > 0) {
        const next = pendingForB.shift();
        if (!next) break;
        void b.addRemoteCandidate(next.candidate, next.mid).catch(() => {
          // Ignore invalid/out-of-order candidates during handshake.
        });
      }
    };

    a.onLocalCandidate((candidate, mid) => {
      if (!bHasRemoteDescription) {
        pendingForB.push({ candidate, mid });
        return;
      }
      void b.addRemoteCandidate(candidate, mid).catch(() => {
        // Ignore invalid/out-of-order candidates during handshake.
      });
    });

    b.onLocalCandidate((candidate, mid) => {
      if (!aHasRemoteDescription) {
        pendingForA.push({ candidate, mid });
        return;
      }
      void a.addRemoteCandidate(candidate, mid).catch(() => {
        // Ignore invalid/out-of-order candidates during handshake.
      });
    });

    a.onLocalDescription((sdp, type) => {
      void b.setRemoteDescription(sdp, type).then(() => {
        bHasRemoteDescription = true;
        flushForB();
      });
    });

    b.onLocalDescription((sdp, type) => {
      void a.setRemoteDescription(sdp, type).then(() => {
        aHasRemoteDescription = true;
        flushForA();
      });
    });
  }

  afterEach(async () => {
    await peerA?.close();
    await peerB?.close();
  });

  function isPeerEventTimeoutError(error: unknown): boolean {
    return error instanceof Error && error.message.startsWith("Timed out waiting for ");
  }

  async function withPeerRetry(run: () => Promise<void>): Promise<void> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        await run();
        return;
      } catch (error) {
        lastError = error;
        await peerA?.close();
        await peerB?.close();
        if (attempt === 2 || !isPeerEventTimeoutError(error)) {
          throw error;
        }
      }
    }

    throw lastError;
  }

  it(
    "establishes a connection and exchanges messages via DataChannel",
    async () => {
      await withPeerRetry(async () => {
        peerA = createPeerConnection(STUN_LOOPBACK_PEER_CONFIG);
        peerB = createPeerConnection(STUN_LOOPBACK_PEER_CONFIG);

        setupSafeSignaling(peerA, peerB);

        const stateChanges: string[] = [];
        peerA.onStateChange((state) => stateChanges.push(state));

        const dcA = peerA.createDataChannel("chat", { ordered: true });

        const dcB = await waitForPeerEvent<AdapterDataChannel>(
          (resolve) => {
            peerB.onDataChannel((dc) => resolve(dc));
            void peerA.setLocalDescription().catch(() => {});
          },
          PEER_EVENT_TIMEOUT_MS,
          "remote data channel",
        );

        await waitForPeerEvent<void>(
          (resolve) => {
            if (dcA.isOpen()) return resolve();
            dcA.onOpen(() => resolve());
          },
          PEER_EVENT_TIMEOUT_MS,
          'local "chat" channel to open',
        );
        await waitForPeerEvent<void>(
          (resolve) => {
            if (dcB.isOpen()) return resolve();
            dcB.onOpen(() => resolve());
          },
          PEER_EVENT_TIMEOUT_MS,
          'remote "chat" channel to open',
        );

        const receivedByB: string[] = [];
        dcB.onMessage((data) => {
          if (typeof data === "string") receivedByB.push(data);
        });

        dcA.sendMessage("hello from A");

        await new Promise((r) => setTimeout(r, 200));
        expect(receivedByB).toContain("hello from A");

        const receivedByA: string[] = [];
        dcA.onMessage((data) => {
          if (typeof data === "string") receivedByA.push(data);
        });

        dcB.sendMessage("hello from B");
        await new Promise((r) => setTimeout(r, 200));
        expect(receivedByA).toContain("hello from B");

        expect(stateChanges).toContain("connected");
      });
    },
    PEER_NEGOTIATION_TIMEOUT_MS,
  );

  it(
    "supports multiple named channels",
    async () => {
      await withPeerRetry(async () => {
        peerA = createPeerConnection(LOOPBACK_PEER_CONFIG);
        peerB = createPeerConnection(LOOPBACK_PEER_CONFIG);

        setupSafeSignaling(peerA, peerB);

        const chatA = peerA.createDataChannel("chat", { ordered: true });
        const canvasA = peerA.createDataChannel("canvas", { ordered: true });

        const remoteDcs = new Map<string, AdapterDataChannel>();
        const allReceived = waitForPeerEvent<void>(
          (resolve) => {
            peerB.onDataChannel((dc) => {
              remoteDcs.set(dc.getLabel(), dc);
              if (remoteDcs.size === 2) resolve();
            });
            void peerA.setLocalDescription().catch(() => {});
          },
          PEER_EVENT_TIMEOUT_MS,
          "all remote data channels",
        );

        await allReceived;

        for (const dc of [chatA, canvasA]) {
          await waitForPeerEvent<void>(
            (resolve) => {
              if (dc.isOpen()) return resolve();
              dc.onOpen(() => resolve());
            },
            PEER_EVENT_TIMEOUT_MS,
            `local "${dc.getLabel()}" channel to open`,
          );
        }
        for (const dc of remoteDcs.values()) {
          await waitForPeerEvent<void>(
            (resolve) => {
              if (dc.isOpen()) return resolve();
              dc.onOpen(() => resolve());
            },
            PEER_EVENT_TIMEOUT_MS,
            `remote "${dc.getLabel()}" channel to open`,
          );
        }

        const chatMessages: string[] = [];
        const chatB = remoteDcs.get("chat");
        expect(chatB).toBeDefined();
        chatB?.onMessage((data) => {
          if (typeof data === "string") chatMessages.push(data);
        });
        chatA.sendMessage("chat msg");

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

        await new Promise((r) => setTimeout(r, 200));

        expect(chatMessages).toContain("chat msg");
        expect(canvasMessages).toHaveLength(1);
        const parsed = JSON.parse(canvasMessages[0]);
        expect(parsed.type).toBe("html");
        expect(parsed.data).toBe("<h1>Hello</h1>");
        expect(parsed.meta.title).toBe("Test");
      });
    },
    PEER_NEGOTIATION_TIMEOUT_MS,
  );

  it(
    "generates offer with STUN servers via onGatheringStateChange",
    async () => {
      const peer = createPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        iceAdditionalHostAddresses: ["127.0.0.1"],
        iceUseIpv6: false,
      });
      const cleanup = async () => {
        try {
          await peer.close();
        } catch {
          /* already closed */
        }
      };

      try {
        peer.createDataChannel("test", { ordered: true });

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

          void peer.setLocalDescription().catch((error) => {
            if (resolved) return;
            resolved = true;
            clearTimeout(timeout);
            reject(error);
          });
        });

        expect(offer.sdp).toContain("v=0");
        expect(offer.type).toBe("offer");
      } finally {
        await cleanup();
      }
    },
    15_000,
  );

  it(
    "bridge protocol messages round-trip over DataChannel",
    async () => {
      await withPeerRetry(async () => {
        const { encodeMessage, decodeMessage, makeTextMessage, makeHtmlMessage } = await import(
          "../../../../shared/bridge-protocol-core"
        );

        peerA = createPeerConnection(LOOPBACK_PEER_CONFIG);
        peerB = createPeerConnection(LOOPBACK_PEER_CONFIG);

        setupSafeSignaling(peerA, peerB);

        const dcA = peerA.createDataChannel("chat", { ordered: true });
        const dcB = await waitForPeerEvent<AdapterDataChannel>(
          (resolve) => {
            peerB.onDataChannel((dc) => resolve(dc));
            void peerA.setLocalDescription().catch(() => {});
          },
          PEER_EVENT_TIMEOUT_MS,
          "remote data channel",
        );

        await waitForPeerEvent<void>(
          (resolve) => {
            if (dcA.isOpen()) return resolve();
            dcA.onOpen(() => resolve());
          },
          PEER_EVENT_TIMEOUT_MS,
          'local "chat" channel to open',
        );
        await waitForPeerEvent<void>(
          (resolve) => {
            if (dcB.isOpen()) return resolve();
            dcB.onOpen(() => resolve());
          },
          PEER_EVENT_TIMEOUT_MS,
          'remote "chat" channel to open',
        );

        const received: string[] = [];
        dcB.onMessage((data) => {
          if (typeof data === "string") received.push(data);
        });

        const textMsg = makeTextMessage("hello bridge");
        dcA.sendMessage(encodeMessage(textMsg));

        const htmlMsg = makeHtmlMessage("<p>test</p>", "Title");
        dcA.sendMessage(encodeMessage(htmlMsg));

        await new Promise((r) => setTimeout(r, 200));

        expect(received).toHaveLength(2);

        const decoded0 = decodeMessage(received[0]);
        expect(decoded0?.type).toBe("text");
        expect(decoded0?.data).toBe("hello bridge");
        expect(decoded0?.id).toBe(textMsg.id);

        const decoded1 = decodeMessage(received[1]);
        expect(decoded1?.type).toBe("html");
        expect(decoded1?.data).toBe("<p>test</p>");
        expect(decoded1?.meta?.title).toBe("Title");
      });
    },
    PEER_NEGOTIATION_TIMEOUT_MS,
  );
});
