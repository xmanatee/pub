import type { PeerConnection } from "node-datachannel";

export function generateOffer(peer: PeerConnection, timeoutMs: number): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let resolved = false;
    const done = (sdp: string, type: string) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      resolve(JSON.stringify({ sdp, type }));
    };

    peer.onLocalDescription((sdp: string, type: string) => {
      done(sdp, type);
    });

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
        reject(new Error(`Timed out after ${timeoutMs}ms`));
      }
    }, timeoutMs);

    peer.setLocalDescription();
  });
}
