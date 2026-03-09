import {
  encodeSessionDescription,
  parseSessionDescription,
} from "../../../shared/webrtc-negotiation-core";
import type { AdapterPeerConnection } from "./webrtc-adapter.js";

/**
 * Create an agent answer from a browser offer using the adapter's async API.
 *
 * The adapter's setRemoteDescription handles createAnswer + setLocalDescription
 * internally and fires the onLocalDescription callback. We wrap this in a
 * Promise with timeout for safety.
 */
export function createAnswer(
  peer: AdapterPeerConnection,
  browserOffer: string,
  timeoutMs: number,
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const finish = (sdp: string, type: string) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      resolve(encodeSessionDescription({ sdp, type }));
    };

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      reject(error);
    };

    peer.onLocalDescription((sdp, type) => {
      finish(sdp, type);
    });

    peer.onGatheringStateChange((state) => {
      if (state !== "complete" || settled) return;
      const local = peer.localDescription();
      if (local) finish(local.sdp, local.type);
    });

    const parsedOffer = parseSessionDescription(browserOffer, "Browser offer");

    void peer.setRemoteDescription(parsedOffer.sdp, parsedOffer.type).catch((error) => {
      fail(error instanceof Error ? error : new Error(String(error)));
    });

    timeout = setTimeout(() => {
      const local = peer.localDescription();
      if (local) {
        finish(local.sdp, local.type);
        return;
      }
      fail(new Error(`Timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
}
