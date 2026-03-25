import type { IceServer } from "../shared/webrtc-transport-core";
import { httpAction } from "./_generated/server";
import { getTurnKeyApiToken, getTurnKeyId } from "./env";
import { corsHeaders } from "./http/shared";
import { rateLimiter } from "./rateLimits";

interface CloudflareResponse {
  iceServers: IceServer[];
}

const TURN_CREDENTIAL_TTL = 86400;

const STUN_FALLBACK: IceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

async function generateIceServers(): Promise<IceServer[]> {
  const keyId = getTurnKeyId();
  const apiToken = getTurnKeyApiToken();
  if (!keyId || !apiToken) return STUN_FALLBACK;

  const url = `https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate-ice-servers`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ttl: TURN_CREDENTIAL_TTL }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Cloudflare TURN API returned ${response.status}: ${body}`);
  }

  const data = (await response.json()) as CloudflareResponse;
  if (!Array.isArray(data.iceServers) || data.iceServers.length === 0) {
    throw new Error("Cloudflare TURN API returned empty iceServers");
  }

  return [...data.iceServers, ...STUN_FALLBACK];
}

export const getIceServers = httpAction(async (ctx, request) => {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("cf-connecting-ip") ??
    "unknown";

  const rl = await rateLimiter.limit(ctx, "getIceServers", { key: ip });
  if (!rl.ok) {
    return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(Math.ceil(rl.retryAfter / 1000)),
        ...corsHeaders(),
      },
    });
  }

  try {
    const iceServers = await generateIceServers();
    const hasTurn = iceServers.some((s) =>
      (Array.isArray(s.urls) ? s.urls : [s.urls]).some((u) => u.startsWith("turn")),
    );
    return new Response(JSON.stringify({ iceServers }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": `public, max-age=${hasTurn ? TURN_CREDENTIAL_TTL / 2 : 3600}`,
        ...corsHeaders(),
      },
    });
  } catch (error) {
    console.error("[turn]", error instanceof Error ? error.message : error);
    return new Response(JSON.stringify({ iceServers: STUN_FALLBACK }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600",
        ...corsHeaders(),
      },
    });
  }
});
