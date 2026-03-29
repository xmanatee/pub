import type { BridgeMessage } from "../../../../../../shared/bridge-protocol-core";
import type { LiveAgentActivity } from "../../../../../../shared/live-runtime-state-core";
import { resolvePubPaths } from "../../../../core/paths.js";

export type RelayInbound =
  | { type: "briefing"; slug: string; content: string }
  | { type: "inbound"; channel: string; msg: BridgeMessage };

export type RelayOutbound =
  | { type: "outbound"; channel: string; msg: BridgeMessage }
  | { type: "activity"; state: LiveAgentActivity };

export type RelayMessage = RelayInbound | RelayOutbound;

export function encodeRelayMessage(msg: RelayMessage): string {
  return JSON.stringify(msg);
}

export function decodeRelayMessage(line: string): RelayMessage | null {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(line) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (typeof parsed.type !== "string") return null;

  switch (parsed.type) {
    case "briefing":
      if (typeof parsed.slug !== "string" || typeof parsed.content !== "string") return null;
      return { type: "briefing", slug: parsed.slug, content: parsed.content };

    case "inbound":
      if (typeof parsed.channel !== "string" || !parsed.msg || typeof parsed.msg !== "object")
        return null;
      return { type: "inbound", channel: parsed.channel, msg: parsed.msg as BridgeMessage };

    case "outbound":
      if (typeof parsed.channel !== "string" || !parsed.msg || typeof parsed.msg !== "object")
        return null;
      return { type: "outbound", channel: parsed.channel, msg: parsed.msg as BridgeMessage };

    case "activity":
      if (typeof parsed.state !== "string") return null;
      return { type: "activity", state: parsed.state as LiveAgentActivity };

    default:
      return null;
  }
}

export function defaultChannelSocketPath(env: NodeJS.ProcessEnv = process.env): string {
  return `${resolvePubPaths(env).socketRoot}/channel.sock`;
}
