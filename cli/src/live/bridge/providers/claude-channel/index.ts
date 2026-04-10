import * as net from "node:net";
import { generateMessageId } from "../../../../../../shared/bridge-protocol-core";
import { errorMessage } from "../../../../core/errors/cli-error.js";
import { createEntryHandler, createErrorChatSender } from "../../entry-handler.js";
import { createBridgeEntryQueue } from "../../queue.js";
import {
  type BridgeCapabilities,
  type BridgeRunner,
  type BridgeRunnerConfig,
  type BridgeStatus,
} from "../../shared.js";
import {
  decodeRelayMessage,
  defaultChannelSocketPath,
  encodeRelayMessage,
  type RelayInbound,
  type RelayOutbound,
} from "./relay-protocol.js";

export { isChannelSocketAvailable, resolveChannelSocketPath } from "./discovery.js";
export { runClaudeChannelBridgeStartupProbe } from "./probe.js";

const CAPABILITIES: BridgeCapabilities = { conversational: true };
const RELAY_CONNECT_TIMEOUT_MS = 10_000;

function connectToRelay(socketPath: string): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      conn.destroy();
      reject(new Error(`Relay socket connection timed out after ${RELAY_CONNECT_TIMEOUT_MS}ms`));
    }, RELAY_CONNECT_TIMEOUT_MS);

    const conn = net.createConnection(socketPath, () => {
      clearTimeout(timer);
      resolve(conn);
    });
    conn.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`Relay socket connection failed: ${err.message}`));
    });
  });
}

export async function createClaudeChannelBridgeRunner(
  config: BridgeRunnerConfig,
  abortSignal?: AbortSignal,
): Promise<BridgeRunner> {
  if (config.bridgeSettings.mode !== "claude-channel") {
    throw new Error("Claude Channel runtime is not prepared.");
  }

  const { slug, sendMessage, debugLog, sessionBriefing } = config;
  const socketPath = config.bridgeSettings.channelSocketPath ?? defaultChannelSocketPath();

  let forwardedMessageCount = 0;
  let lastError: string | undefined;
  let stopped = abortSignal?.aborted ?? false;

  const conn = await connectToRelay(socketPath);
  debugLog(`connected to channel relay at ${socketPath}`);

  if (abortSignal) {
    abortSignal.addEventListener(
      "abort",
      () => {
        stopped = true;
        conn.destroy();
      },
      { once: true },
    );
  }

  let buffer = "";
  conn.on("data", (chunk: Buffer) => {
    buffer += chunk.toString("utf-8");
    let idx = buffer.indexOf("\n");
    while (idx !== -1) {
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      if (line.trim().length === 0) {
        idx = buffer.indexOf("\n");
        continue;
      }
      const msg = decodeRelayMessage(line);
      if (!msg) {
        debugLog(`ignoring malformed relay message: ${line.slice(0, 120)}`);
        idx = buffer.indexOf("\n");
        continue;
      }
      if (msg.type === "outbound" || msg.type === "activity") {
        handleOutbound(msg);
      }
      idx = buffer.indexOf("\n");
    }
  });

  conn.on("close", () => {
    if (!stopped) {
      debugLog("relay connection closed unexpectedly");
      lastError = "Relay connection closed";
    }
  });

  conn.on("error", (err) => {
    lastError = err.message;
    debugLog(`relay connection error: ${err.message}`);
  });

  function handleOutbound(msg: RelayOutbound): void {
    if (stopped) return;
    if (msg.type === "activity") {
      config.onActivityChange(msg.state);
      return;
    }
    if (msg.channel === "canvas" && msg.msg.type === "html" && typeof msg.msg.data === "string") {
      config.onCanvasWrite?.(msg.msg.data);
      return;
    }
    void sendMessage(msg.channel, msg.msg).catch((err) => {
      debugLog(`failed to send outbound on ${msg.channel}: ${errorMessage(err)}`);
    });
  }

  function sendToRelay(msg: RelayInbound): void {
    if (stopped || conn.destroyed) {
      throw new Error("Relay connection is not available");
    }
    conn.write(`${encodeRelayMessage(msg)}\n`);
  }

  async function deliverToRelay(prompt: string): Promise<void> {
    sendToRelay({
      type: "inbound",
      channel: "chat",
      msg: { id: generateMessageId(), type: "text", data: prompt },
    });
  }

  sendToRelay({ type: "briefing", slug, content: sessionBriefing });
  debugLog("session briefing sent to channel server");

  const handler = createEntryHandler({
    slug,
    attachmentRoot: config.bridgeSettings.attachmentDir,
    activeStreams: new Map(),
    deliver: deliverToRelay,
    onDeliveryUpdate: config.onDeliveryUpdate,
    onForwarded: () => {
      forwardedMessageCount += 1;
    },
    onError: (message) => {
      lastError = message;
    },
    sendErrorToChat: createErrorChatSender(sendMessage),
    debugLog,
  });

  const queue = createBridgeEntryQueue({
    onProcessingStart: () => config.onActivityChange("thinking"),
    onProcessingEnd: () => config.onActivityChange("idle"),
    onBatch: handler.onBatch,
  });

  return {
    capabilities: CAPABILITIES,
    enqueue: (entries) => queue.enqueue(entries),
    async stop(): Promise<void> {
      if (stopped) return;
      stopped = true;
      await queue.stop();
      conn.destroy();
    },
    status(): BridgeStatus {
      return {
        running: !stopped && !conn.destroyed,
        lastError,
        forwardedMessages: forwardedMessageCount,
      };
    },
  };
}
