/**
 * Pub FS Service Worker — intercepts /__pub_files__/* requests and streams
 * file bytes from the host machine via a MessagePort relay to the main page.
 *
 * Architecture (WebTorrent-inspired pull-based MessagePort protocol):
 * 1. SW intercepts fetch for /__pub_files__/path/to/file
 * 2. SW creates MessageChannel, sends request + port1 to controlled client
 * 3. Client page relays port1 to pub.blue parent via postMessage
 * 4. Parent page fetches file bytes from CLI via WebRTC data channel
 * 5. Parent sends metadata/chunks/done/error to port1
 * 6. SW reads from port2, constructs Response with ReadableStream body
 */

var PUB_FS_PREFIX = "/__pub_files__/";
var METADATA_TIMEOUT_MS = 30000;

self.addEventListener("install", function () {
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", function (event) {
  var url = new URL(event.request.url);
  if (!url.pathname.startsWith(PUB_FS_PREFIX)) return;
  event.respondWith(handlePubFileRequest(event));
});

async function handlePubFileRequest(event) {
  var url = new URL(event.request.url);
  var filePath = decodeURIComponent(url.pathname.slice(PUB_FS_PREFIX.length));
  if (!filePath) {
    return new Response("Missing file path", { status: 400 });
  }

  var range = parseRangeHeader(event.request.headers.get("range"));
  var requestId = crypto.randomUUID();

  var clientList = await self.clients.matchAll({ type: "window", includeUncontrolled: false });
  if (clientList.length === 0) {
    return new Response("No active client", { status: 502 });
  }

  var channel = new MessageChannel();
  var port = channel.port2;

  clientList[0].postMessage(
    {
      type: "pub-fs-request",
      requestId: requestId,
      path: filePath,
      rangeStart: range ? range.start : undefined,
      rangeEnd: range ? range.end : undefined,
    },
    [channel.port1],
  );

  return new Promise(function (resolve) {
    var resolved = false;
    var controller = null;

    var metadataTimeout = setTimeout(function () {
      port.onmessage = null;
      if (!resolved) {
        resolved = true;
        resolve(new Response("Timeout waiting for file metadata", { status: 504 }));
      }
    }, METADATA_TIMEOUT_MS);

    var body = new ReadableStream({
      start: function (c) {
        controller = c;
      },
      cancel: function () {
        port.postMessage({ type: "cancel" });
        port.onmessage = null;
      },
    });

    port.onmessage = function (ev) {
      var msg = ev.data;
      if (!msg || typeof msg.type !== "string") return;

      if (msg.type === "metadata") {
        clearTimeout(metadataTimeout);
        resolved = true;
        resolve(
          new Response(body, {
            status: range ? 206 : 200,
            statusText: range ? "Partial Content" : "OK",
            headers: buildResponseHeaders(msg, range),
          }),
        );
        return;
      }

      if (msg.type === "chunk") {
        if (controller && msg.data) {
          controller.enqueue(new Uint8Array(msg.data));
        }
        return;
      }

      if (msg.type === "done") {
        if (controller) controller.close();
        port.onmessage = null;
        return;
      }

      if (msg.type === "error") {
        clearTimeout(metadataTimeout);
        port.onmessage = null;
        if (resolved) {
          if (controller) controller.error(new Error(msg.message || "File read error"));
        } else {
          resolved = true;
          resolve(
            new Response(msg.message || "File read error", {
              status: msg.code === "NOT_FOUND" ? 404 : 502,
            }),
          );
        }
      }
    };
  });
}

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

function buildResponseHeaders(metadata, range) {
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
