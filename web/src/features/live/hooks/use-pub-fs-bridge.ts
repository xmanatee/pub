import { useCallback, useEffect, useRef, useState } from "react";
import { CHANNELS } from "~/features/live/lib/bridge-protocol";
import { PubFsBridge } from "~/features/live/lib/pub-fs-bridge";
import type { BrowserBridge, ChannelMessage } from "~/features/live/lib/webrtc-browser";

interface UsePubFsBridgeOptions {
  bridgeRef: React.RefObject<BrowserBridge | null>;
  enabled: boolean;
  ensureChannel: (channel: string, timeoutMs?: number) => Promise<boolean>;
}

export function usePubFsBridge({ bridgeRef, enabled, ensureChannel }: UsePubFsBridgeOptions) {
  const pubFsBridgeRef = useRef<PubFsBridge | null>(null);
  const [ready, setReady] = useState(false);

  const getReadyBridge = useCallback(async () => {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      const bridge = bridgeRef.current;
      if (bridge) {
        const remaining = Math.max(1, deadline - Date.now());
        const ready = await ensureChannel(CHANNELS.PUB_FS, Math.min(5_000, remaining));
        if (ready && bridgeRef.current) return bridgeRef.current;
      }
      await new Promise<void>((resolve) => window.setTimeout(resolve, 50));
    }
    return null;
  }, [bridgeRef, ensureChannel]);

  useEffect(() => {
    if (!enabled) {
      pubFsBridgeRef.current?.destroy();
      pubFsBridgeRef.current = null;
      setReady(false);
      return;
    }
    const bridge = new PubFsBridge(bridgeRef, getReadyBridge);
    pubFsBridgeRef.current = bridge;
    setReady(true);
    return () => {
      bridge.destroy();
      pubFsBridgeRef.current = null;
      setReady(false);
    };
  }, [bridgeRef, enabled, getReadyBridge]);

  const setIframeWindow = useCallback((win: Window | null) => {
    pubFsBridgeRef.current?.setIframeWindow(win);
  }, []);

  const handlePubFsChannelMessage = useCallback((cm: ChannelMessage) => {
    pubFsBridgeRef.current?.handleChannelMessage(cm);
  }, []);

  return { setIframeWindow, handlePubFsChannelMessage, ready };
}
