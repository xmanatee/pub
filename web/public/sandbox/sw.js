/**
 * Pub FS Service Worker — intercepts /__pub_files__/* and proxies file
 * operations (GET/PUT/DELETE) to the host machine via MessagePort relay.
 *
 * GET  → check range-aware cache first, then stream from host
 * PUT  → write request body to host path (invalidates cache)
 * DELETE → delete file on host (invalidates cache)
 *
 * Uses a range-aware progressive cache: bytes received for any request
 * (including partial/cancelled ones) are retained, so subsequent range
 * requests to previously-fetched byte regions are served instantly.
 */

var PUB_FS_PREFIX = "/__pub_files__/";
var RESPONSE_TIMEOUT_MS = 120000;
var MAX_CACHE_FILE_SIZE = 200 * 1024 * 1024;
var MAX_TOTAL_CACHE_SIZE = 500 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Range-aware file cache
// ---------------------------------------------------------------------------
//
// fileCache[path] = {
//   buffer: ArrayBuffer,           — pre-allocated to totalSize
//   totalSize: number,
//   mime: string,
//   ranges: [[start, end], ...],   — sorted, merged filled byte ranges
//   lastAccess: number,            — for LRU eviction
// }

var fileCache = Object.create(null);
var totalCacheBytes = 0;

// Tracks in-flight GET streams for progressive cache population.
// activeStreams[requestId] = { path: string, writeOffset: number }
var activeStreams = Object.create(null);

function mergeRange(ranges, start, end) {
  var result = [];
  var merged = [start, end];
  var inserted = false;
  for (var i = 0; i < ranges.length; i++) {
    var r = ranges[i];
    if (r[1] < merged[0] - 1) {
      result.push(r);
    } else if (r[0] > merged[1] + 1) {
      if (!inserted) {
        result.push(merged);
        inserted = true;
      }
      result.push(r);
    } else {
      merged[0] = Math.min(merged[0], r[0]);
      merged[1] = Math.max(merged[1], r[1]);
    }
  }
  if (!inserted) result.push(merged);
  return result;
}

function rangesContain(ranges, start, end) {
  for (var i = 0; i < ranges.length; i++) {
    if (ranges[i][0] <= start && ranges[i][1] >= end) return true;
  }
  return false;
}

function initCacheEntry(path, totalSize, mime) {
  if (fileCache[path]) {
    fileCache[path].lastAccess = Date.now();
    return fileCache[path];
  }
  if (totalSize > MAX_CACHE_FILE_SIZE || totalSize <= 0) return null;
  evictIfNeeded(totalSize);
  var entry = {
    buffer: new ArrayBuffer(totalSize),
    totalSize: totalSize,
    mime: mime || "application/octet-stream",
    ranges: [],
    lastAccess: Date.now(),
  };
  fileCache[path] = entry;
  totalCacheBytes += totalSize;
  return entry;
}

function evictIfNeeded(needed) {
  while (totalCacheBytes + needed > MAX_TOTAL_CACHE_SIZE) {
    var oldestPath = null;
    var oldestTime = Infinity;
    for (var p in fileCache) {
      if (fileCache[p].lastAccess < oldestTime) {
        oldestTime = fileCache[p].lastAccess;
        oldestPath = p;
      }
    }
    if (!oldestPath) break;
    removeCacheEntry(oldestPath);
  }
}

function removeCacheEntry(path) {
  var entry = fileCache[path];
  if (!entry) return;
  totalCacheBytes -= entry.totalSize;
  delete fileCache[path];
}

function addCacheData(path, offset, data) {
  var entry = fileCache[path];
  if (!entry || offset + data.byteLength > entry.totalSize) return;
  new Uint8Array(entry.buffer).set(new Uint8Array(data), offset);
  entry.ranges = mergeRange(entry.ranges, offset, offset + data.byteLength - 1);
}

// ---------------------------------------------------------------------------
// Service Worker lifecycle
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function extractPath(url) {
  var trimmed = decodeURIComponent(url.pathname.slice(PUB_FS_PREFIX.length));
  if (trimmed.startsWith("_/")) {
    return "/./" + trimmed.slice(2);
  }
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

// ---------------------------------------------------------------------------
// Request router
// ---------------------------------------------------------------------------

async function handleRequest(event) {
  var filePath = extractPath(new URL(event.request.url));
  if (!filePath) return new Response("Missing file path", { status: 400 });

  var method = event.request.method;

  if (method === "GET" || method === "HEAD") {
    var cached = fileCache[filePath];
    if (cached) {
      var response = serveCachedResponse(cached, event.request);
      if (response) return response;
    }
  }

  var client = await getClient(event.clientId);
  if (!client) return new Response("No requesting client", { status: 502 });

  if (method === "GET" || method === "HEAD") return handleGet(event, client, filePath);
  if (method === "PUT") return handlePut(event, client, filePath);
  if (method === "DELETE") return handleDelete(client, filePath);
  return new Response("Method not allowed", { status: 405 });
}

// ---------------------------------------------------------------------------
// Cache serving
// ---------------------------------------------------------------------------

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
  var start = resolved ? resolved.start : 0;
  var end = resolved ? resolved.end : cached.totalSize - 1;
  if (!rangesContain(cached.ranges, start, end)) return null;

  cached.lastAccess = Date.now();
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
  var body = cached.buffer.slice(start, end + 1);
  return new Response(body, {
    status: resolved ? 206 : 200,
    statusText: resolved ? "Partial Content" : "OK",
    headers: headers,
  });
}

// ---------------------------------------------------------------------------
// GET (streaming with Range support + progressive cache)
// ---------------------------------------------------------------------------

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
      delete activeStreams[requestId];
      if (!resolved) {
        resolved = true;
        resolve(new Response("Timeout", { status: 504 }));
      }
    }, RESPONSE_TIMEOUT_MS);

    var body = new ReadableStream({
      start: function (c) {
        controller = c;
      },
      cancel: function () {
        delete activeStreams[requestId];
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
        var entry = initCacheEntry(filePath, msg.totalSize, msg.mime);
        if (entry) {
          activeStreams[requestId] = { path: filePath, writeOffset: msg.rangeStart };
        }
        resolve(
          new Response(event.request.method === "HEAD" ? null : body, {
            status: range ? 206 : 200,
            statusText: range ? "Partial Content" : "OK",
            headers: buildGetHeaders(msg, range),
          }),
        );
        return;
      }

      if (msg.type === "chunk") {
        if (controller && msg.data) {
          var chunk = new Uint8Array(msg.data);
          controller.enqueue(chunk);
          var stream = activeStreams[requestId];
          if (stream) {
            addCacheData(stream.path, stream.writeOffset, msg.data);
            stream.writeOffset += chunk.length;
          }
        }
        return;
      }

      if (msg.type === "done") {
        if (controller) controller.close();
        port.onmessage = null;
        delete activeStreams[requestId];
        return;
      }

      if (msg.type === "error") {
        clearTimeout(timer);
        port.onmessage = null;
        delete activeStreams[requestId];
        if (resolved) {
          if (controller) controller.error(new Error(msg.message || "Read error"));
        } else {
          resolved = true;
          resolve(
            new Response(msg.message || "Read error", {
              status: msg.code === "NOT_FOUND" ? 404 : 502,
            }),
          );
        }
      }
    };
  });
}

// ---------------------------------------------------------------------------
// PUT (write file, invalidates cache)
// ---------------------------------------------------------------------------

async function handlePut(event, client, filePath) {
  removeCacheEntry(filePath);
  var bodyBuffer = await event.request.arrayBuffer();
  var port = sendToClient(
    client,
    {
      type: "pub-fs-request",
      method: "PUT",
      requestId: crypto.randomUUID(),
      path: filePath,
      size: bodyBuffer.byteLength,
      body: bodyBuffer,
    },
    [bodyBuffer],
  );

  var response = await waitForResponse(port, RESPONSE_TIMEOUT_MS);
  if (response.type === "done") return new Response(null, { status: 201 });
  return new Response(response.message || "Write failed", {
    status: response.code === "NOT_FOUND" ? 404 : 502,
  });
}

// ---------------------------------------------------------------------------
// DELETE (invalidates cache)
// ---------------------------------------------------------------------------

async function handleDelete(client, filePath) {
  removeCacheEntry(filePath);
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// External messages (keepalive, cache control)
// ---------------------------------------------------------------------------

self.addEventListener("message", function (event) {
  if (!event.data) return;
  if (event.data.type === "keepalive") {
    if (event.source && typeof event.source.postMessage === "function") {
      event.source.postMessage({ type: "keepalive-ack" });
    }
  }
  if (event.data.type === "clear-cache") {
    fileCache = Object.create(null);
    totalCacheBytes = 0;
    activeStreams = Object.create(null);
  }
});
