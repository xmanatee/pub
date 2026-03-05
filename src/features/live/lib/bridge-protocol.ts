export * from "../../../../shared/bridge-protocol-core";

export const STUN_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

export const DATACHANNEL_OPTIONS: RTCDataChannelInit = {
  ordered: true,
};
