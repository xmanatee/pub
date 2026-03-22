/**
 * Test proxy that combines Convex API port (3210) and site port (3211)
 * on a single port (3212).
 *
 * - HTTP requests to /api/v1/* or /serve/* or /og/* → site port (HTTP actions)
 * - All other HTTP + WebSocket → API port (Convex client, auth, subscriptions)
 *
 * This is needed because the CLI's `getConvexCloudUrl()` only handles
 * `.convex.site` → `.convex.cloud` domain conversion, not localhost ports.
 */
import { createServer, request as httpRequest } from "node:http";
import { createConnection } from "node:net";

const CONVEX_HOST = process.env.CONVEX_HOST ?? "localhost";
const HTTP_PORT = Number(process.env.CONVEX_SITE_PORT ?? 3211);
const WS_PORT = Number(process.env.CONVEX_API_PORT ?? 3210);
const PROXY_PORT = Number(process.env.PROXY_PORT ?? 3212);

/** Routes that are Convex HTTP actions (site port). Everything else goes to the API port. */
function isSiteRoute(url) {
  if (!url) return false;
  return (
    url.startsWith("/api/v1/") ||
    url.startsWith("/serve/") ||
    url.startsWith("/og/")
  );
}

const server = createServer((req, res) => {
  const port = isSiteRoute(req.url) ? HTTP_PORT : WS_PORT;
  const proxyReq = httpRequest(
    {
      hostname: CONVEX_HOST,
      port,
      path: req.url,
      method: req.method,
      headers: req.headers,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );
  proxyReq.on("error", () => res.writeHead(502).end());
  req.pipe(proxyReq);
});

server.on("upgrade", (req, socket, head) => {
  const target = createConnection({ host: CONVEX_HOST, port: WS_PORT }, () => {
    const headers = [`GET ${req.url} HTTP/1.1`];
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      headers.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
    }
    target.write(`${headers.join("\r\n")}\r\n\r\n`);
    if (head.length > 0) target.write(head);
    target.pipe(socket);
    socket.pipe(target);
  });
  target.on("error", () => socket.destroy());
  socket.on("error", () => target.destroy());
});

server.listen(PROXY_PORT, "127.0.0.1", () => {
  console.log(`[proxy] site(${HTTP_PORT}) api(${WS_PORT}) on 127.0.0.1:${PROXY_PORT} → ${CONVEX_HOST}`);
});
