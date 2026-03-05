import type { PeerConnection } from "node-datachannel";
import { createAgentAnswerFromBrowserOffer } from "../../../shared/webrtc-negotiation-core";

export function createAnswer(
  peer: PeerConnection,
  browserOffer: string,
  timeoutMs: number,
): Promise<string> {
  return createAgentAnswerFromBrowserOffer(
    {
      setRemoteDescription: (sdp, type) => {
        peer.setRemoteDescription(sdp, type);
      },
      onLocalDescription: (cb) => {
        peer.onLocalDescription((sdp, type) => cb(sdp, type));
      },
      onGatheringStateChange: (cb) => {
        peer.onGatheringStateChange((state) => cb(state));
      },
      getLocalDescription: () => peer.localDescription(),
    },
    browserOffer,
    timeoutMs,
  );
}
