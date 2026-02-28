import { CONTROL_CHANNEL } from "./bridge-protocol";

export interface AckChannelResolutionInput {
  controlChannelOpen: boolean;
  messageChannel: string;
  messageChannelOpen: boolean;
}

export function resolveAckChannel(input: AckChannelResolutionInput): string | null {
  if (input.messageChannelOpen) return input.messageChannel;
  if (input.controlChannelOpen) return CONTROL_CHANNEL;
  return null;
}
