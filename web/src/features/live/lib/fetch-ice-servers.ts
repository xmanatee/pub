function getConvexSiteUrl(): string {
  const cloudUrl = import.meta.env.VITE_CONVEX_URL as string;
  if (!cloudUrl) throw new Error("VITE_CONVEX_URL is not configured");
  return cloudUrl.replace(/\.convex\.cloud$/, ".convex.site");
}

export async function fetchIceServers(): Promise<RTCIceServer[]> {
  const siteUrl = getConvexSiteUrl();
  const response = await fetch(`${siteUrl}/api/v1/ice-servers`);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`ICE server request failed (${response.status}): ${body}`);
  }
  const data = (await response.json()) as { iceServers: RTCIceServer[] };
  if (!Array.isArray(data.iceServers) || data.iceServers.length === 0) {
    throw new Error("ICE server response contains no servers");
  }
  return data.iceServers;
}
