export type CanvasBridgeInboundType = "command.invoke" | "command.cancel";

export interface CanvasBridgeInboundMessage {
  type: CanvasBridgeInboundType;
  payload: Record<string, unknown>;
}

export type CanvasBridgeOutboundType = "command.bind.result" | "command.result";

export interface CanvasBridgeOutboundMessage {
  id: string;
  type: CanvasBridgeOutboundType;
  payload: Record<string, unknown>;
}
