/**
 * Test proxy that combines Convex API port (3210) and site port (3211)
 * on a single port (3212).
 *
 * - HTTP requests to /api/v1/* or /serve/* or /og/* → site port (HTTP actions)
 * - All other HTTP + WebSocket → API port (Convex client, auth, subscriptions)
 *
 * This is needed because the CLI's `getConvexCloudUrl()` only handles
 * `.convex.site` → `.convex.cloud` domain conversion, not localhost ports.
 *
 * When FORCE_TURN_RELAY=1, the proxy injects `transportPolicy: "relay"` into
 * the /api/v1/ice-servers response, forcing the browser to use TURN relay only.
 */
import { createServer, request as httpRequest } from "node:http";
import { createConnection } from "node:net";

const CONVEX_HOST = process.env.CONVEX_HOST ?? "localhost";
const HTTP_PORT = Number(process.env.CONVEX_SITE_PORT ?? 3211);
const WS_PORT = Number(process.env.CONVEX_API_PORT ?? 3210);
const PROXY_PORT = Number(process.env.PROXY_PORT ?? 3212);
const FORCE_TURN_RELAY = process.env.FORCE_TURN_RELAY === "1";

/** Routes that are Convex HTTP actions (site port). Everything else goes to the API port. */
function isSiteRoute(url) {
  if (!url) return false;
  return (
    url.startsWith("/api/v1/") ||
    url.startsWith("/serve/") ||
    url.startsWith("/og/")
  );
}

/**
 * Proxy a request, optionally transforming the JSON response body.
 * When transform is null, the response is piped through unchanged.
 */
function proxyRequest(req, res, port, transform) {
  const proxyReq = httpRequest(
    {
      hostname: CONVEX_HOST,
      port,
      path: req.url,
      method: req.method,
      headers: req.headers,
    },
    (proxyRes) => {
      if (!transform) {
        res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
        proxyRes.pipe(res);
        return;
      }
      const chunks = [];
      proxyRes.on("data", (chunk) => chunks.push(chunk));
      proxyRes.on("end", () => {
        const body = Buffer.concat(chunks).toString();
        const transformed = transform(body, proxyRes.statusCode ?? 200);
        const headers = { ...proxyRes.headers, "content-length": Buffer.byteLength(transformed) };
        res.writeHead(proxyRes.statusCode ?? 502, headers);
        res.end(transformed);
      });
    },
  );
  proxyReq.on("error", () => res.writeHead(502).end());
  req.pipe(proxyReq);
}

const server = createServer((req, res) => {
  const port = isSiteRoute(req.url) ? HTTP_PORT : WS_PORT;

  // Inject transportPolicy into ICE servers response to force TURN relay
  if (FORCE_TURN_RELAY && req.url === "/api/v1/ice-servers" && req.method === "GET") {
    proxyRequest(req, res, port, (body, status) => {
      if (status !== 200) return body;
      const data = JSON.parse(body);
      data.transportPolicy = "relay";
      return JSON.stringify(data);
    });
    return;
  }

  proxyRequest(req, res, port, null);
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
  const mode = FORCE_TURN_RELAY ? " (TURN relay forced)" : "";
  console.log(`[proxy] site(${HTTP_PORT}) api(${WS_PORT}) on 127.0.0.1:${PROXY_PORT} → ${CONVEX_HOST}${mode}`);
});
