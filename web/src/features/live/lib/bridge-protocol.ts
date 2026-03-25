export * from "@shared/bridge-protocol-core";

import { ORDERED_DATA_CHANNEL_OPTIONS } from "@shared/webrtc-transport-core";

export const DATACHANNEL_OPTIONS: RTCDataChannelInit = { ...ORDERED_DATA_CHANNEL_OPTIONS };
