import { useEffect, useState } from "react";
import {
  isTunnelAnimationStyle,
  TUNNEL_ANIMATION_STYLES,
  type TunnelAnimationStyle,
} from "./types";

const STORAGE_KEYS = {
  autoOpenCanvas: "pubblue:tunnel:auto-open-canvas",
  showDeliveryStatus: "pubblue:tunnel:show-delivery-status",
  animationStyle: "pubblue:tunnel:animation-style",
} as const;

function readStoredBoolean(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(key);
  if (raw === "1") return true;
  if (raw === "0") return false;
  return fallback;
}

function readStoredAnimationStyle(): TunnelAnimationStyle {
  if (typeof window === "undefined") return TUNNEL_ANIMATION_STYLES[0];
  const raw = window.localStorage.getItem(STORAGE_KEYS.animationStyle);
  if (raw && isTunnelAnimationStyle(raw)) return raw;
  return TUNNEL_ANIMATION_STYLES[0];
}

export function useTunnelPreferences() {
  const [autoOpenCanvas, setAutoOpenCanvas] = useState(() =>
    readStoredBoolean(STORAGE_KEYS.autoOpenCanvas, true),
  );
  const [showDeliveryStatus, setShowDeliveryStatus] = useState(() =>
    readStoredBoolean(STORAGE_KEYS.showDeliveryStatus, true),
  );
  const [animationStyle, setAnimationStyle] =
    useState<TunnelAnimationStyle>(readStoredAnimationStyle);

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

  return {
    autoOpenCanvas,
    setAutoOpenCanvas,
    showDeliveryStatus,
    setShowDeliveryStatus,
    animationStyle,
    setAnimationStyle,
  };
}
