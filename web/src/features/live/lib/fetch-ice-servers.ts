import type { IceServer } from "@shared/webrtc-transport-core";
import { getConvexUrl } from "~/lib/convex-url";

function getConvexSiteUrl(): string {
  return getConvexUrl().replace(/\.convex\.cloud$/, ".convex.site");
}

export async function fetchIceServers(): Promise<IceServer[]> {
  const siteUrl = getConvexSiteUrl();
  const response = await fetch(`${siteUrl}/api/v1/ice-servers`);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`ICE server request failed (${response.status}): ${body}`);
  }
  const data = (await response.json()) as { iceServers: IceServer[] };
  if (!Array.isArray(data.iceServers) || data.iceServers.length === 0) {
    throw new Error("ICE server response contains no servers");
  }
  return data.iceServers;
}
