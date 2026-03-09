export * from "../../../../shared/bridge-protocol-core";

import {
  ORDERED_DATA_CHANNEL_OPTIONS,
  WEBRTC_ICE_SERVER_CONFIG,
} from "../../../../shared/webrtc-transport-core";

export const STUN_SERVERS: RTCIceServer[] = WEBRTC_ICE_SERVER_CONFIG.map((entry) => ({
  urls: entry.urls,
}));

export const DATACHANNEL_OPTIONS: RTCDataChannelInit = { ...ORDERED_DATA_CHANNEL_OPTIONS };
