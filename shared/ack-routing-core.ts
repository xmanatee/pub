import { CONTROL_CHANNEL } from "./bridge-protocol-core";

export type AckChannelResolutionInput = {
  controlChannelOpen: boolean;
  messageChannelOpen: boolean;
  messageChannel: string;
};

export function resolveAckChannel(input: AckChannelResolutionInput): string | null {
  if (input.messageChannelOpen) return input.messageChannel;
  if (input.controlChannelOpen) return CONTROL_CHANNEL;
  return null;
}
