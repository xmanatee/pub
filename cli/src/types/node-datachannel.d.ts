declare module "node-datachannel" {
  interface PeerConnectionConfig {
    iceServers?: string[];
  }

  interface DataChannelOptions {
    ordered?: boolean;
    maxRetransmits?: number;
    protocol?: string;
  }

  class DataChannel {
    onMessage(cb: (data: string | Buffer) => void): void;
    onOpen(cb: () => void): void;
    onClosed(cb: () => void): void;
    sendMessage(msg: string): void;
    sendMessageBinary(data: Buffer): void;
    close(): void;
    getLabel(): string;
    isOpen(): boolean;
  }

  class PeerConnection {
    constructor(name: string, config?: PeerConnectionConfig);
    onLocalDescription(cb: (sdp: string, type: string) => void): void;
    onLocalCandidate(cb: (candidate: string, mid: string) => void): void;
    onStateChange(cb: (state: string) => void): void;
    onGatheringStateChange(cb: (state: string) => void): void;
    onDataChannel(cb: (dc: DataChannel) => void): void;
    setLocalDescription(type?: string): void;
    setRemoteDescription(sdp: string, type: string): void;
    localDescription(): { sdp: string; type: string } | null;
    addRemoteCandidate(candidate: string, mid: string): void;
    createDataChannel(label: string, opts?: DataChannelOptions): DataChannel;
    close(): void;
  }
}
