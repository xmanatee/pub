import * as net from "node:net";
import { errorMessage } from "../../core/errors/cli-error.js";
import { type IpcRequest, parseIpcRequest } from "../transport/ipc-protocol.js";

type DaemonIpcRequestHandler = (request: IpcRequest) => Promise<Record<string, unknown>>;

export function createDaemonIpcServer(
  handler: DaemonIpcRequestHandler,
  onError?: (error: Error) => void,
): net.Server {
  const server = net.createServer((conn) => {
    conn.on("error", (error) => {
      onError?.(error);
    });
    let data = "";
    conn.on("data", (chunk) => {
      data += chunk.toString();
      const newlineIdx = data.indexOf("\n");
      if (newlineIdx === -1) return;

      const line = data.slice(0, newlineIdx);
      data = data.slice(newlineIdx + 1);

      try {
        const request = parseIpcRequest(JSON.parse(line));
        if (!request) {
          conn.write(`${JSON.stringify({ ok: false, error: "Invalid request" })}\n`);
          return;
        }
        handler(request)
          .then((response) => conn.write(`${JSON.stringify(response)}\n`))
          .catch((err) =>
            conn.write(`${JSON.stringify({ ok: false, error: errorMessage(err) })}\n`),
          );
      } catch {
        conn.write(`${JSON.stringify({ ok: false, error: "Invalid JSON" })}\n`);
      }
    });
  });
  server.on("error", (error) => {
    onError?.(error);
  });
  return server;
}
