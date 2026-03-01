import { useEffect, useState } from "react";
import { isLiveAnimationStyle, LIVE_ANIMATION_STYLES, type LiveAnimationStyle } from "./types";

const STORAGE_KEYS = {
  autoOpenCanvas: "pubblue:live:auto-open-canvas",
  showDeliveryStatus: "pubblue:live:show-delivery-status",
  animationStyle: "pubblue:live:animation-style",
  voiceModeEnabled: "pubblue:live:voice-mode-enabled",
} as const;

function readStoredBoolean(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(key);
  if (raw === "1") return true;
  if (raw === "0") return false;
  return fallback;
}

function readStoredAnimationStyle(): LiveAnimationStyle {
  if (typeof window === "undefined") return LIVE_ANIMATION_STYLES[0];
  const raw = window.localStorage.getItem(STORAGE_KEYS.animationStyle);
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

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEYS.autoOpenCanvas, autoOpenCanvas ? "1" : "0");
  }, [autoOpenCanvas]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEYS.showDeliveryStatus, showDeliveryStatus ? "1" : "0");
  }, [showDeliveryStatus]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEYS.animationStyle, animationStyle);
  }, [animationStyle]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEYS.voiceModeEnabled, voiceModeEnabled ? "1" : "0");
  }, [voiceModeEnabled]);

  return {
    autoOpenCanvas,
    setAutoOpenCanvas,
    showDeliveryStatus,
    setShowDeliveryStatus,
    animationStyle,
    setAnimationStyle,
    voiceModeEnabled,
    setVoiceModeEnabled,
  };
}
