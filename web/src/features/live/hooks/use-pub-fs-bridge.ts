import { useCallback, useEffect, useRef } from "react";
import { PubFsBridge } from "~/features/live/lib/pub-fs-bridge";
import type { BrowserBridge, ChannelMessage } from "~/features/live/lib/webrtc-browser";

interface UsePubFsBridgeOptions {
  bridgeRef: React.RefObject<BrowserBridge | null>;
  enabled: boolean;
}

export function usePubFsBridge({ bridgeRef, enabled }: UsePubFsBridgeOptions) {
  const pubFsBridgeRef = useRef<PubFsBridge | null>(null);

  useEffect(() => {
    if (!enabled) {
      pubFsBridgeRef.current?.destroy();
      pubFsBridgeRef.current = null;
      return;
    }
    const bridge = new PubFsBridge(bridgeRef);
    pubFsBridgeRef.current = bridge;
    return () => {
      bridge.destroy();
      pubFsBridgeRef.current = null;
    };
  }, [bridgeRef, enabled]);

  const setIframeWindow = useCallback((win: Window | null) => {
    pubFsBridgeRef.current?.setIframeWindow(win);
  }, []);

  const handlePubFsChannelMessage = useCallback((cm: ChannelMessage) => {
    pubFsBridgeRef.current?.handleChannelMessage(cm);
  }, []);

  const resetPubFs = useCallback(() => {
    pubFsBridgeRef.current?.reset();
  }, []);

  return { setIframeWindow, handlePubFsChannelMessage, resetPubFs };
}
