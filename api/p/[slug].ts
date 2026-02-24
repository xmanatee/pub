export const config = { runtime: "edge" };

const SLUG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export default async function handler(request: Request) {
  const url = new URL(request.url);
  const slug = url.pathname.replace("/api/p/", "");

  if (!slug) {
    return new Response("Missing slug", { status: 400 });
  }

  let decodedSlug: string;
  try {
    decodedSlug = decodeURIComponent(slug);
  } catch {
    return new Response("Invalid slug", { status: 400 });
  }
  if (!SLUG_PATTERN.test(decodedSlug)) {
    return new Response("Invalid slug", { status: 400 });
  }

  const secret = process.env.PROXY_SECRET;
  if (!secret) {
    return new Response("Server misconfigured", { status: 500 });
  }

  const convexSiteUrl = process.env.CONVEX_SITE_URL || "https://silent-guanaco-514.convex.site";
  const upstream = await fetch(`${convexSiteUrl}/serve/${encodeURIComponent(decodedSlug)}`, {
    headers: { "X-Proxy-Token": secret },
  });

  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.delete("transfer-encoding");

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}
