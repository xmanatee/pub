import {
  type BridgeMessage,
  encodeMessage,
  shouldAcknowledgeMessage,
} from "../../../../shared/bridge-protocol-core";
import type { LiveRuntimeStateSnapshot } from "../../../../shared/live-runtime-state-core";
import type { IpcRequest } from "../transport/ipc-protocol.js";
import type { AdapterDataChannel } from "../transport/webrtc-adapter.js";

interface DaemonIpcHandlerParams {
  persistCanvasHtml: (html: string) => Promise<Record<string, unknown>>;
  getRuntimeState: () => LiveRuntimeStateSnapshot;
  getSignalingConnected: () => boolean | null;
  getActiveSlug: () => string | null;
  getUptimeSeconds: () => number;
  getChannels: () => string[];
  getLastError: () => string | null;
  getBridgeMode: () => string | null;
  getBridgeStatus: () => unknown;
  getLogPath: () => string | null;
  getWriteReadinessError: () => string | null;
  openDataChannel: (channel: string) => AdapterDataChannel;
  waitForChannelOpen: (channel: AdapterDataChannel, timeoutMs?: number) => Promise<void>;
  waitForDeliveryAck: (messageId: string, channel: string, timeoutMs: number) => Promise<boolean>;
  settlePendingAck: (messageId: string, channel: string, received: boolean) => void;
  markAgentStreaming: () => void;
  markError: (message: string, error?: unknown) => void;
  shutdown: () => void;
  writeAckTimeoutMs: number;
  writeAckMaxAttempts: number;
}

function unreachableIpcRequest(request: never): never {
  throw new Error(`Unsupported IPC request: ${JSON.stringify(request)}`);
}

export function createDaemonIpcHandler(params: DaemonIpcHandlerParams) {
  return async function handleIpcRequest(req: IpcRequest): Promise<Record<string, unknown>> {
    switch (req.method) {
      case "write": {
        const channel = req.params.channel || "chat";
        const msg: BridgeMessage = req.params.msg;

        if (channel === "canvas" && msg.type === "html" && typeof msg.data === "string") {
          return await params.persistCanvasHtml(msg.data);
        }

        const readinessError = params.getWriteReadinessError();
        if (readinessError) return { ok: false, error: readinessError };

        const binaryBase64 =
          typeof req.params.binaryBase64 === "string" ? req.params.binaryBase64 : undefined;
        const binaryPayload =
          msg.type === "binary" && binaryBase64 ? Buffer.from(binaryBase64, "base64") : undefined;

        const maxAttempts = Math.max(1, params.writeAckMaxAttempts);
        let lastError: string | null = null;

        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
          let targetDc: AdapterDataChannel;
          try {
            targetDc = params.openDataChannel(channel);
            await params.waitForChannelOpen(targetDc);
          } catch (error) {
            params.markError(
              `channel "${channel}" failed to open (attempt ${attempt}/${maxAttempts})`,
              error,
            );
            lastError = `Channel "${channel}" not open: ${
              error instanceof Error ? error.message : String(error)
            }`;
            continue;
          }

          const waitForAck = shouldAcknowledgeMessage(channel, msg)
            ? params.waitForDeliveryAck(msg.id, channel, params.writeAckTimeoutMs)
            : null;

          try {
            if (msg.type === "binary" && binaryPayload) {
              targetDc.sendMessage(
                encodeMessage({
                  ...msg,
                  meta: { ...(msg.meta || {}), size: binaryPayload.length },
                }),
              );
              targetDc.sendMessageBinary(binaryPayload);
            } else {
              targetDc.sendMessage(encodeMessage(msg));
            }
          } catch (error) {
            if (waitForAck) params.settlePendingAck(msg.id, channel, false);
            params.markError(
              `failed to send message on channel "${channel}" (attempt ${attempt}/${maxAttempts})`,
              error,
            );
            lastError = `Failed to send on channel "${channel}": ${
              error instanceof Error ? error.message : String(error)
            }`;
            continue;
          }

          if (waitForAck) {
            const acked = await waitForAck;
            if (!acked) {
              params.markError(
                `delivery ack timeout for message ${msg.id} on "${channel}" (attempt ${attempt}/${maxAttempts})`,
              );
              lastError = `Delivery not confirmed for message ${msg.id} within ${params.writeAckTimeoutMs}ms.`;
              continue;
            }
          }

          params.markAgentStreaming();
          return { ok: true, delivered: true };
        }

        return {
          ok: false,
          error:
            lastError ??
            `Failed to send on channel "${channel}" after ${maxAttempts} attempt${maxAttempts === 1 ? "" : "s"}.`,
        };
      }

      case "status": {
        const runtimeState = params.getRuntimeState();
        return {
          ok: true,
          ...runtimeState,
          signalingConnected: params.getSignalingConnected(),
          activeSlug: params.getActiveSlug(),
          uptime: params.getUptimeSeconds(),
          channels: params.getChannels(),
          lastError: params.getLastError(),
          bridgeMode: params.getBridgeMode(),
          bridge: params.getBridgeStatus(),
          logPath: params.getLogPath(),
        };
      }

      case "active-slug": {
        return { ok: true, slug: params.getActiveSlug() };
      }

      case "close": {
        params.shutdown();
        return { ok: true };
      }

      default: {
        return unreachableIpcRequest(req);
      }
    }
  };
}
