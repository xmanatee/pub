import type { BridgeMessage } from "../../../../shared/bridge-protocol-core";
import type { LiveRuntimeStateSnapshot } from "../../../../shared/live-runtime-state-core";
import type { BridgeSettings } from "../../core/config/index.js";
import type { BridgeRunner } from "../bridge/shared.js";
import { executeCommandSpec } from "../command/run-spec.js";
import type { IpcRequest } from "../transport/ipc-protocol.js";

interface DaemonIpcHandlerParams {
  persistCanvasHtml: (html: string) => Promise<Record<string, unknown>>;
  persistFiles: (files: Record<string, string>) => Promise<Record<string, unknown>>;
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
  sendOutboundMessageWithAck: (
    channel: string,
    msg: BridgeMessage,
    options?: {
      binaryPayload?: Buffer;
      context?: string;
      maxAttempts?: number;
      ackTimeoutMs?: number;
    },
  ) => Promise<boolean>;
  markAgentStreaming: () => void;
  shutdown: () => void;
  writeAckTimeoutMs: number;
  writeAckMaxAttempts: number;
  /** Resolves the current bridge settings (runtime-augmented when a session is active). */
  getBridgeSettings: () => BridgeSettings;
  getBridgeRunner?: () => BridgeRunner | null;
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

        const delivered = await params.sendOutboundMessageWithAck(channel, msg, {
          binaryPayload,
          context: `ipc write on "${channel}"`,
          maxAttempts: Math.max(1, params.writeAckMaxAttempts),
          ackTimeoutMs: params.writeAckTimeoutMs,
        });
        if (!delivered) {
          return {
            ok: false,
            error: `Failed to deliver message ${msg.id} on channel "${channel}".`,
          };
        }

        params.markAgentStreaming();
        return { ok: true, delivered: true };
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

      case "write-files": {
        return await params.persistFiles(req.params.files);
      }

      case "run-command-spec": {
        const controller = new AbortController();
        try {
          const value = await executeCommandSpec(req.params.spec, req.params.args, {
            bridgeSettings: params.getBridgeSettings(),
            signal: controller.signal,
            requestedTimeoutMs: req.params.requestedTimeoutMs,
            getBridgeRunner: params.getBridgeRunner,
          });
          return { ok: true, value };
        } catch (error) {
          return {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }

      default: {
        return unreachableIpcRequest(req);
      }
    }
  };
}
