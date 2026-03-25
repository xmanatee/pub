import * as fs from "node:fs";
import * as net from "node:net";
import {
  type RelayInbound,
  type RelayOutbound,
  decodeRelayMessage,
  encodeRelayMessage,
} from "../live/bridge/providers/claude-channel/relay-protocol.js";

function unlinkSocketIfPresent(socketPath: string): void {
  try {
    fs.unlinkSync(socketPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

export function createRelayServer(params: {
  socketPath: string;
  onInbound: (msg: RelayInbound) => void;
  onConnected: () => void;
  onDisconnected: () => void;
  debugLog: (msg: string) => void;
}) {
  let activeConnection: net.Socket | null = null;
  let serverClosed = false;

  const server = net.createServer((conn) => {
    if (activeConnection) {
      params.debugLog("rejecting extra relay connection");
      conn.destroy();
      return;
    }
    activeConnection = conn;
    params.onConnected();

    let buffer = "";
    conn.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf-8");
      let idx: number;
      while ((idx = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        if (line.trim().length === 0) continue;
        const msg = decodeRelayMessage(line);
        if (msg && (msg.type === "briefing" || msg.type === "inbound")) {
          params.onInbound(msg);
        } else {
          params.debugLog(`ignoring malformed relay line: ${line.slice(0, 120)}`);
        }
      }
    });

    conn.on("close", () => {
      activeConnection = null;
      params.onDisconnected();
    });

    conn.on("error", (err) => {
      params.debugLog(`relay connection error: ${err.message}`);
    });
  });

  return {
    async listen(): Promise<void> {
      unlinkSocketIfPresent(params.socketPath);

      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(params.socketPath, () => resolve());
      });
    },
    send(msg: RelayOutbound): boolean {
      if (!activeConnection || activeConnection.destroyed) return false;
      activeConnection.write(`${encodeRelayMessage(msg)}\n`);
      return true;
    },
    async close(): Promise<void> {
      if (serverClosed) return;
      serverClosed = true;
      activeConnection?.destroy();
      activeConnection = null;
      await new Promise<void>((resolve) => server.close(() => resolve()));
      unlinkSocketIfPresent(params.socketPath);
    },
  };
}
