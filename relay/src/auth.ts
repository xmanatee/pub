export interface TunnelValidation {
  userId: string;
  hostId: string;
}

export interface DaemonValidation {
  userId: string;
  apiKeyId: string;
  hostId: string;
}

export async function validateTunnelToken(
  convexSiteUrl: string,
  token: string,
): Promise<TunnelValidation | null> {
  const url = `${convexSiteUrl}/api/v1/tunnel/validate?token=${encodeURIComponent(token)}`;
  const response = await fetch(url);
  if (!response.ok) return null;
  const data = (await response.json()) as { userId?: string; hostId?: string };
  if (!data.userId || !data.hostId) return null;
  return { userId: data.userId, hostId: data.hostId };
}

export async function validateDaemonAuth(
  convexSiteUrl: string,
  apiKey: string,
  daemonSessionId: string,
): Promise<DaemonValidation | null> {
  const response = await fetch(`${convexSiteUrl}/api/v1/tunnel/validate-daemon`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ daemonSessionId }),
  });
  if (!response.ok) return null;
  const data = (await response.json()) as {
    userId?: string;
    apiKeyId?: string;
    hostId?: string;
  };
  if (!data.userId || !data.apiKeyId || !data.hostId) return null;
  return { userId: data.userId, apiKeyId: data.apiKeyId, hostId: data.hostId };
}
