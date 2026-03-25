export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

/** Protocols supported by werift (browser supports all including turns:). */
const SUPPORTED_ICE_PROTOCOLS = ["stun:", "turn:"] as const;

/**
 * Normalize ICE servers for werift compatibility.
 *
 * Filters out `turns:` (TURN over TLS) which werift does not support.
 * Browser clients should NOT use this — they support all protocols natively.
 */
export function normalizeIceServers(servers: IceServer[]): IceServer[] {
  return servers
    .map((server) => {
      const urls = typeof server.urls === "string" ? [server.urls] : server.urls;
      const supported = urls.filter((url) =>
        SUPPORTED_ICE_PROTOCOLS.some((proto) => url.startsWith(proto)),
      );
      if (supported.length === 0) return null;
      return {
        ...server,
        urls: supported.length === 1 ? supported[0] : supported,
      };
    })
    .filter((s): s is IceServer => s !== null);
}

export const ORDERED_DATA_CHANNEL_OPTIONS = {
  ordered: true,
} as const;
