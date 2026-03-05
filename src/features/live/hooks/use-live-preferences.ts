import { useEffect, useState } from "react";
import {
  isLiveAnimationStyle,
  LIVE_ANIMATION_STYLES,
  type LiveAnimationStyle,
} from "~/features/live/types/live-types";

const STORAGE_KEYS = {
  autoOpenCanvas: "pubblue:live:auto-open-canvas",
  showDeliveryStatus: "pubblue:live:show-delivery-status",
  animationStyle: "pubblue:live:animation-style",
  voiceModeEnabled: "pubblue:live:voice-mode-enabled",
  micGranted: "pubblue:live:mic-granted",
} as const;

type GetItem = (key: string) => string | null;

const defaultGetItem: GetItem =
  typeof window !== "undefined" ? (key) => window.localStorage.getItem(key) : () => null;

export function readStoredBoolean(
  key: string,
  fallback: boolean,
  getItem: GetItem = defaultGetItem,
): boolean {
  const raw = getItem(key);
  if (raw === "1") return true;
  if (raw === "0") return false;
  return fallback;
}

export function readStoredAnimationStyle(getItem: GetItem = defaultGetItem): LiveAnimationStyle {
  const raw = getItem(STORAGE_KEYS.animationStyle);
  if (raw && isLiveAnimationStyle(raw)) return raw;
  return LIVE_ANIMATION_STYLES[0];
}

export function useLivePreferences() {
  const [autoOpenCanvas, setAutoOpenCanvas] = useState(() =>
    readStoredBoolean(STORAGE_KEYS.autoOpenCanvas, true),
  );
  const [showDeliveryStatus, setShowDeliveryStatus] = useState(() =>
    readStoredBoolean(STORAGE_KEYS.showDeliveryStatus, true),
  );
  const [animationStyle, setAnimationStyle] =
    useState<LiveAnimationStyle>(readStoredAnimationStyle);
  const [voiceModeEnabled, setVoiceModeEnabled] = useState(() =>
    readStoredBoolean(STORAGE_KEYS.voiceModeEnabled, false),
  );
  const [micGranted, setMicGranted] = useState(() =>
    readStoredBoolean(STORAGE_KEYS.micGranted, false),
  );

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.autoOpenCanvas, autoOpenCanvas ? "1" : "0");
  }, [autoOpenCanvas]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.showDeliveryStatus, showDeliveryStatus ? "1" : "0");
  }, [showDeliveryStatus]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.animationStyle, animationStyle);
  }, [animationStyle]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.voiceModeEnabled, voiceModeEnabled ? "1" : "0");
  }, [voiceModeEnabled]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.micGranted, micGranted ? "1" : "0");
  }, [micGranted]);

  return {
    autoOpenCanvas,
    setAutoOpenCanvas,
    showDeliveryStatus,
    setShowDeliveryStatus,
    animationStyle,
    setAnimationStyle,
    voiceModeEnabled,
    setVoiceModeEnabled,
    micGranted,
    setMicGranted,
  };
}
