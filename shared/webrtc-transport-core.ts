export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

/** Protocols supported by all WebRTC clients (browser + werift). */
const SUPPORTED_ICE_PROTOCOLS = ["stun:", "turn:"] as const;

/**
 * Normalize ICE servers for cross-client compatibility.
 *
 * - Filters out unsupported protocols (e.g. `turns:` — werift lacks TLS TURN support)
 * - Drops entries that have no usable URLs after filtering
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
