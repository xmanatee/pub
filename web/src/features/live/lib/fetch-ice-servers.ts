import type { IceServer } from "@shared/webrtc-transport-core";
import { getConvexUrl } from "~/lib/convex-url";

export interface IceConfig {
  iceServers: IceServer[];
  transportPolicy?: RTCIceTransportPolicy;
}

function getConvexSiteUrl(): string {
  return getConvexUrl().replace(/\.convex\.cloud$/, ".convex.site");
}

export async function fetchIceConfig(): Promise<IceConfig> {
  const siteUrl = getConvexSiteUrl();
  const response = await fetch(`${siteUrl}/api/v1/ice-servers`);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`ICE server request failed (${response.status}): ${body}`);
  }
  const data = (await response.json()) as { iceServers: IceServer[]; transportPolicy?: string };
  if (!Array.isArray(data.iceServers) || data.iceServers.length === 0) {
    throw new Error("ICE server response contains no servers");
  }
  return {
    iceServers: data.iceServers,
    transportPolicy: data.transportPolicy as RTCIceTransportPolicy | undefined,
  };
}
