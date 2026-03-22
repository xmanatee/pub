/**
 * Pub FS Service Worker — intercepts /__pub_files__/* and proxies file
 * operations (GET/PUT/DELETE) to the host machine via MessagePort relay.
 *
 * GET  → stream file bytes from host (Range/206 support)
 * PUT  → write request body to host path
 * DELETE → delete file on host
 */

var PUB_FS_PREFIX = "/__pub_files__/";
var RESPONSE_TIMEOUT_MS = 30000;

self.addEventListener("install", function () {
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", function (event) {
  var url = new URL(event.request.url);
  if (!url.pathname.startsWith(PUB_FS_PREFIX)) return;
  event.respondWith(handleRequest(event));
});

function extractPath(url) {
  return decodeURIComponent(url.pathname.slice(PUB_FS_PREFIX.length));
}

async function getClient() {
  var list = await self.clients.matchAll({ type: "window", includeUncontrolled: false });
  return list[0] || null;
}

function sendToClient(client, msg, transfers) {
  var channel = new MessageChannel();
  client.postMessage(msg, [channel.port1].concat(transfers || []));
  return channel.port2;
}

function waitForResponse(port, timeoutMs) {
  return new Promise(function (resolve) {
    var timer = setTimeout(function () {
      port.onmessage = null;
      resolve({ type: "error", code: "TIMEOUT", message: "Operation timed out" });
    }, timeoutMs);
    port.onmessage = function (ev) {
      clearTimeout(timer);
      port.onmessage = null;
      resolve(ev.data);
    };
  });
}

async function handleRequest(event) {
  var filePath = extractPath(new URL(event.request.url));
  if (!filePath) return new Response("Missing file path", { status: 400 });

  var client = await getClient();
  if (!client) return new Response("No active client", { status: 502 });

  var method = event.request.method;
  if (method === "GET" || method === "HEAD") return handleGet(event, client, filePath);
  if (method === "PUT") return handlePut(event, client, filePath);
  if (method === "DELETE") return handleDelete(client, filePath);
  return new Response("Method not allowed", { status: 405 });
}

// --- GET (streaming with Range support) ---

async function handleGet(event, client, filePath) {
  var range = parseRangeHeader(event.request.headers.get("range"));
  var requestId = crypto.randomUUID();

  var port = sendToClient(client, {
    type: "pub-fs-request",
    method: "GET",
    requestId: requestId,
    path: filePath,
    rangeStart: range ? range.start : undefined,
    rangeEnd: range ? range.end : undefined,
  });

  return new Promise(function (resolve) {
    var resolved = false;
    var controller = null;

    var timer = setTimeout(function () {
      port.onmessage = null;
      if (!resolved) {
        resolved = true;
        resolve(new Response("Timeout", { status: 504 }));
      }
    }, RESPONSE_TIMEOUT_MS);

    var body = new ReadableStream({
      start: function (c) { controller = c; },
      cancel: function () {
        port.postMessage({ type: "cancel" });
        port.onmessage = null;
      },
    });

    port.onmessage = function (ev) {
      var msg = ev.data;
      if (!msg || typeof msg.type !== "string") return;

      if (msg.type === "metadata") {
        clearTimeout(timer);
        resolved = true;
        resolve(new Response(event.request.method === "HEAD" ? null : body, {
          status: range ? 206 : 200,
          statusText: range ? "Partial Content" : "OK",
          headers: buildGetHeaders(msg, range),
        }));
        return;
      }

      if (msg.type === "chunk") {
        if (controller && msg.data) controller.enqueue(new Uint8Array(msg.data));
        return;
      }

      if (msg.type === "done") {
        if (controller) controller.close();
        port.onmessage = null;
        return;
      }

      if (msg.type === "error") {
        clearTimeout(timer);
        port.onmessage = null;
        if (resolved) {
          if (controller) controller.error(new Error(msg.message || "Read error"));
        } else {
          resolved = true;
          resolve(new Response(msg.message || "Read error", {
            status: msg.code === "NOT_FOUND" ? 404 : 502,
          }));
        }
      }
    };
  });
}

// --- PUT (write file) ---

async function handlePut(event, client, filePath) {
  var bodyBuffer = await event.request.arrayBuffer();
  var port = sendToClient(client, {
    type: "pub-fs-request",
    method: "PUT",
    requestId: crypto.randomUUID(),
    path: filePath,
    size: bodyBuffer.byteLength,
    body: bodyBuffer,
  }, [bodyBuffer]);

  var response = await waitForResponse(port, RESPONSE_TIMEOUT_MS);
  if (response.type === "done") return new Response(null, { status: 201 });
  return new Response(response.message || "Write failed", {
    status: response.code === "NOT_FOUND" ? 404 : 502,
  });
}

// --- DELETE ---

async function handleDelete(client, filePath) {
  var port = sendToClient(client, {
    type: "pub-fs-request",
    method: "DELETE",
    requestId: crypto.randomUUID(),
    path: filePath,
  });

  var response = await waitForResponse(port, RESPONSE_TIMEOUT_MS);
  if (response.type === "done") return new Response(null, { status: 204 });
  return new Response(response.message || "Delete failed", {
    status: response.code === "NOT_FOUND" ? 404 : 502,
  });
}

// --- Helpers ---

function parseRangeHeader(header) {
  if (!header || typeof header !== "string") return null;
  var normalized = header.trim().toLowerCase();
  if (!normalized.startsWith("bytes=")) return null;
  if (normalized.indexOf(",") !== -1) return null;
  var match = /bytes=(\d*)-(\d*)/.exec(normalized);
  if (!match || (!match[1] && !match[2])) return null;
  return {
    start: match[1] ? Number(match[1]) : undefined,
    end: match[2] ? Number(match[2]) : undefined,
  };
}

function buildGetHeaders(metadata, range) {
  var headers = {
    "Content-Type": metadata.mime || "application/octet-stream",
    "Accept-Ranges": "bytes",
  };
  if (range) {
    headers["Content-Range"] =
      "bytes " + metadata.rangeStart + "-" + metadata.rangeEnd + "/" + metadata.totalSize;
    headers["Content-Length"] = String(metadata.rangeEnd - metadata.rangeStart + 1);
  } else {
    headers["Content-Length"] = String(metadata.totalSize);
  }
  return headers;
}

self.addEventListener("message", function (event) {
  if (event.data && event.data.type === "keepalive") {
    if (event.source && typeof event.source.postMessage === "function") {
      event.source.postMessage({ type: "keepalive-ack" });
    }
  }
});
