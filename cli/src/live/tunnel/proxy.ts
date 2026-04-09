import type {
  DaemonToRelayMessage,
  HttpRequestMessage,
} from "../../../../shared/tunnel-protocol-core";
import { uint8ToBase64 } from "./encoding.js";

const STREAMING_CONTENT_TYPES = new Set(["text/event-stream"]);

export interface HttpProxy {
  handle(msg: HttpRequestMessage, send: (msg: DaemonToRelayMessage) => void): Promise<void>;
}

export function createHttpProxy(port: number): HttpProxy {
  return {
    async handle(msg, send) {
      const url = `http://localhost:${port}${msg.path}`;

      const headers = new Headers(msg.headers);
      headers.delete("host");

      let body: Uint8Array | undefined;
      if (msg.body) {
        body = Uint8Array.from(atob(msg.body), (c) => c.charCodeAt(0));
      }

      let response: Response;
      try {
        response = await fetch(url, {
          method: msg.method,
          headers,
          body: body as BodyInit | undefined,
          redirect: "manual",
          signal: AbortSignal.timeout(30_000),
        });
      } catch (error) {
        send({
          type: "http-response",
          id: msg.id,
          status: 502,
          headers: { "content-type": "text/plain" },
          body: btoa(`Bad Gateway: ${error instanceof Error ? error.message : String(error)}`),
        });
        return;
      }

      const responseHeaders: Record<string, string> = {};
      for (const [k, v] of response.headers.entries()) {
        responseHeaders[k] = v;
      }

      const contentType = response.headers.get("content-type") ?? "";
      const shouldStream =
        STREAMING_CONTENT_TYPES.has(contentType.split(";")[0].trim()) ||
        response.headers.has("transfer-encoding");

      if (shouldStream && response.body) {
        send({ type: "http-response-start", id: msg.id, status: response.status, headers: responseHeaders });
        const reader = response.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            send({ type: "http-response-chunk", id: msg.id, data: "", done: true });
            break;
          }
          send({ type: "http-response-chunk", id: msg.id, data: uint8ToBase64(value), done: false });
        }
        return;
      }

      const responseBody = new Uint8Array(await response.arrayBuffer());
      send({
        type: "http-response",
        id: msg.id,
        status: response.status,
        headers: responseHeaders,
        body: responseBody.byteLength > 0 ? uint8ToBase64(responseBody) : undefined,
      });
    },
  };
}
