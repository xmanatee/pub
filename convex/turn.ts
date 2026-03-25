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

async function generateIceServers(): Promise<{ servers: IceServer[]; source: "turn" | "stun" }> {
  const keyId = getTurnKeyId();
  const apiToken = getTurnKeyApiToken();
  if (!keyId || !apiToken) {
    console.warn("[turn] TURN not configured, using STUN fallback", {
      hasKeyId: !!keyId,
      hasApiToken: !!apiToken,
    });
    return { servers: STUN_FALLBACK, source: "stun" };
  }

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

  return { servers: data.iceServers, source: "turn" };
}

export const debugTurnConfig = httpAction(async () => {
  const keyId = process.env.TURN_KEY_ID;
  const apiToken = process.env.TURN_KEY_API_TOKEN;
  const allKeys = Object.keys(process.env).sort();
  return new Response(
    JSON.stringify({
      hasKeyId: !!keyId,
      keyIdLength: keyId?.length ?? 0,
      keyIdPrefix: keyId?.slice(0, 4) ?? null,
      hasApiToken: !!apiToken,
      apiTokenLength: apiToken?.length ?? 0,
      apiTokenPrefix: apiToken?.slice(0, 4) ?? null,
      envKeys: allKeys,
    }),
    { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders() } },
  );
});

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
    const { servers, source } = await generateIceServers();
    console.info(`[turn] Returning ${servers.length} ICE server(s) from ${source}`);
    const cacheMaxAge = source === "turn" ? TURN_CREDENTIAL_TTL / 2 : 3600;
    return new Response(JSON.stringify({ iceServers: servers }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": `public, max-age=${cacheMaxAge}`,
        ...corsHeaders(),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[turn] Failed to generate ICE servers:", message);
    console.warn("[turn] Falling back to STUN after TURN failure");
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
