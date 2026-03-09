export const WEBRTC_STUN_URLS = [
  "stun:stun.l.google.com:19302",
  "stun:stun1.l.google.com:19302",
] as const;

export const WEBRTC_ICE_SERVER_CONFIG = [
  { urls: WEBRTC_STUN_URLS[0] },
  { urls: WEBRTC_STUN_URLS[1] },
] as const;

export const ORDERED_DATA_CHANNEL_OPTIONS = {
  ordered: true,
} as const;
