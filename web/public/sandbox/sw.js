/**
 * Pub FS Service Worker — intercepts /__pub_files__/* and proxies file
 * operations (GET/PUT/DELETE) to the host machine via MessagePort relay.
 *
 * GET  → check in-memory cache first, then stream from host (Range/206 support)
 * PUT  → write request body to host path (invalidates cache)
 * DELETE → delete file on host (invalidates cache)
 *
 * Full-file responses are cached in memory so subsequent range requests
 * (e.g. video seeking) are served instantly without a WebRTC roundtrip.
 */

var PUB_FS_PREFIX = "/__pub_files__/";
var RESPONSE_TIMEOUT_MS = 30000;

// In-memory file cache: path → { buffer: ArrayBuffer, mime: string, totalSize: number }
var fileCache = Object.create(null);

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
  var trimmed = decodeURIComponent(url.pathname.slice(PUB_FS_PREFIX.length));
  return trimmed.startsWith("/") ? trimmed : "/" + trimmed;
}

async function getClient(clientId) {
  if (!clientId || typeof clientId !== "string") return null;
  return await self.clients.get(clientId);
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

  var method = event.request.method;

  if (method === "GET" || method === "HEAD") {
    var cached = fileCache[filePath];
    if (cached) return serveCachedResponse(cached, event.request);
  }

  var client = await getClient(event.clientId);
  if (!client) return new Response("No requesting client", { status: 502 });

  if (method === "GET" || method === "HEAD") return handleGet(event, client, filePath);
  if (method === "PUT") return handlePut(event, client, filePath);
  if (method === "DELETE") return handleDelete(client, filePath);
  return new Response("Method not allowed", { status: 405 });
}

// --- Cache ---

function resolveRange(range, totalSize) {
  if (!range) return null;
  var start, end;
  if (range.start !== undefined && range.end !== undefined) {
    start = range.start;
    end = Math.min(range.end, totalSize - 1);
  } else if (range.start !== undefined) {
    start = range.start;
    end = totalSize - 1;
  } else if (range.end !== undefined) {
    start = Math.max(0, totalSize - range.end);
    end = totalSize - 1;
  } else {
    return null;
  }
  if (start > end || start >= totalSize) return "unsatisfiable";
  return { start: start, end: end };
}

function serveCachedResponse(cached, request) {
  var rawRange = parseRangeHeader(request.headers.get("range"));
  var resolved = resolveRange(rawRange, cached.totalSize);
  if (resolved === "unsatisfiable") {
    return new Response("Range Not Satisfiable", { status: 416 });
  }
  var headers = {
    "Content-Type": cached.mime || "application/octet-stream",
    "Accept-Ranges": "bytes",
  };
  if (resolved) {
    headers["Content-Range"] =
      "bytes " + resolved.start + "-" + resolved.end + "/" + cached.totalSize;
    headers["Content-Length"] = String(resolved.end - resolved.start + 1);
  } else {
    headers["Content-Length"] = String(cached.totalSize);
  }
  if (request.method === "HEAD") {
    return new Response(null, {
      status: resolved ? 206 : 200,
      statusText: resolved ? "Partial Content" : "OK",
      headers: headers,
    });
  }
  var body = resolved
    ? cached.buffer.slice(resolved.start, resolved.end + 1)
    : cached.buffer.slice(0);
  return new Response(body, {
    status: resolved ? 206 : 200,
    statusText: resolved ? "Partial Content" : "OK",
    headers: headers,
  });
}

// --- GET (streaming with Range support + cache population) ---

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
    var cacheChunks = null;
    var cacheMeta = null;

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
        cacheChunks = null;
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
        cacheMeta = msg;
        // Cache full-file responses (rangeStart=0 and rangeEnd=totalSize-1)
        if (msg.rangeStart === 0 && msg.rangeEnd === msg.totalSize - 1) {
          cacheChunks = [];
        }
        resolve(new Response(event.request.method === "HEAD" ? null : body, {
          status: range ? 206 : 200,
          statusText: range ? "Partial Content" : "OK",
          headers: buildGetHeaders(msg, range),
        }));
        return;
      }

      if (msg.type === "chunk") {
        if (controller && msg.data) {
          var chunk = new Uint8Array(msg.data);
          controller.enqueue(chunk);
          if (cacheChunks) cacheChunks.push(chunk.slice());
        }
        return;
      }

      if (msg.type === "done") {
        if (controller) controller.close();
        port.onmessage = null;
        if (cacheChunks && cacheMeta) {
          assembleCache(filePath, cacheMeta, cacheChunks);
        }
        cacheChunks = null;
        return;
      }

      if (msg.type === "error") {
        clearTimeout(timer);
        port.onmessage = null;
        cacheChunks = null;
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

function assembleCache(filePath, meta, chunks) {
  var totalLen = 0;
  for (var i = 0; i < chunks.length; i++) totalLen += chunks[i].length;
  var buffer = new ArrayBuffer(totalLen);
  var view = new Uint8Array(buffer);
  var offset = 0;
  for (var j = 0; j < chunks.length; j++) {
    view.set(chunks[j], offset);
    offset += chunks[j].length;
  }
  fileCache[filePath] = {
    buffer: buffer,
    mime: meta.mime || "application/octet-stream",
    totalSize: meta.totalSize,
  };
}

// --- PUT (write file, invalidates cache) ---

async function handlePut(event, client, filePath) {
  delete fileCache[filePath];
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

// --- DELETE (invalidates cache) ---

async function handleDelete(client, filePath) {
  delete fileCache[filePath];
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
  if (!event.data) return;
  if (event.data.type === "keepalive") {
    if (event.source && typeof event.source.postMessage === "function") {
      event.source.postMessage({ type: "keepalive-ack" });
    }
  }
  if (event.data.type === "clear-cache") {
    fileCache = Object.create(null);
  }
});
