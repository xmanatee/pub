import * as net from "node:net";
import { errorMessage } from "./cli-error.js";
import type { RawIpcRequest } from "./live-ipc-protocol.js";

type DaemonIpcRequestHandler = (request: RawIpcRequest) => Promise<Record<string, unknown>>;

export function createDaemonIpcServer(handler: DaemonIpcRequestHandler): net.Server {
  return net.createServer((conn) => {
    let data = "";
    conn.on("data", (chunk) => {
      data += chunk.toString();
      const newlineIdx = data.indexOf("\n");
      if (newlineIdx === -1) return;

      const line = data.slice(0, newlineIdx);
      data = data.slice(newlineIdx + 1);

      let request: RawIpcRequest;
      try {
        request = JSON.parse(line) as RawIpcRequest;
      } catch {
        conn.write(`${JSON.stringify({ ok: false, error: "Invalid JSON" })}\n`);
        return;
      }

      handler(request)
        .then((response) => conn.write(`${JSON.stringify(response)}\n`))
        .catch((err) => conn.write(`${JSON.stringify({ ok: false, error: errorMessage(err) })}\n`));
    });
  });
}
