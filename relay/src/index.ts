import { validateDaemonAuth, validateTunnelToken } from "./auth";

export { TunnelObject } from "./tunnel-object";

interface Env {
  TUNNEL: DurableObjectNamespace;
  CONVEX_SITE_URL: string;
}

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (url.pathname === "/daemon") {
      return handleDaemonRoute(request, url, env);
    }

    if (url.pathname.startsWith("/ws/")) {
      return handleBrowserWsRoute(request, url, env);
    }

    if (url.pathname.startsWith("/t/")) {
      return handleHttpProxyRoute(request, url, env);
    }

    if (url.pathname === "/health") {
      return new Response("ok", { headers: CORS_HEADERS });
    }

    return new Response("Not Found", { status: 404, headers: CORS_HEADERS });
  },
};

async function handleDaemonRoute(request: Request, url: URL, env: Env): Promise<Response> {
  if (request.headers.get("Upgrade") !== "websocket") {
    return new Response("Expected WebSocket upgrade", { status: 426 });
  }

  const apiKey = url.searchParams.get("apiKey");
  const sessionId = url.searchParams.get("sessionId");
  if (!apiKey || !sessionId) {
    return new Response("Missing apiKey or sessionId", { status: 400 });
  }

  const validation = await validateDaemonAuth(env.CONVEX_SITE_URL, apiKey, sessionId);
  if (!validation) {
    return new Response("Unauthorized", { status: 403 });
  }

  const doId = env.TUNNEL.idFromName(validation.hostId);
  const stub = env.TUNNEL.get(doId);
  return stub.fetch(new Request(new URL("/daemon", request.url).toString(), request));
}

function extractToken(url: URL): string | null {
  return url.pathname.split("/")[2] || null;
}

async function handleBrowserWsRoute(request: Request, url: URL, env: Env): Promise<Response> {
  const token = extractToken(url);
  if (!token) return new Response("Missing token", { status: 400, headers: CORS_HEADERS });

  const validation = await validateTunnelToken(env.CONVEX_SITE_URL, token);
  if (!validation) return new Response("Invalid token", { status: 401, headers: CORS_HEADERS });

  const doId = env.TUNNEL.idFromName(validation.hostId);
  const stub = env.TUNNEL.get(doId);
  return stub.fetch(new Request(new URL(`/ws/${token}`, request.url).toString(), request));
}

async function handleHttpProxyRoute(request: Request, url: URL, env: Env): Promise<Response> {
  const token = extractToken(url);
  if (!token) return new Response("Missing token", { status: 400, headers: CORS_HEADERS });

  const validation = await validateTunnelToken(env.CONVEX_SITE_URL, token);
  if (!validation) return new Response("Invalid token", { status: 401, headers: CORS_HEADERS });

  const doId = env.TUNNEL.idFromName(validation.hostId);
  const stub = env.TUNNEL.get(doId);

  const response = await stub.fetch(
    new Request(url.toString(), {
      method: request.method,
      headers: request.headers,
      body: request.body,
    }),
  );

  const responseHeaders = new Headers(response.headers);
  for (const [k, v] of Object.entries(CORS_HEADERS)) {
    responseHeaders.set(k, v);
  }

  return new Response(response.body, { status: response.status, headers: responseHeaders });
}
