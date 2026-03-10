import { useEffect, useState } from "react";

const STORAGE_KEYS = {
  autoOpenCanvas: "pub:live:auto-open-canvas",
  voiceModeEnabled: "pub:live:voice-mode-enabled",
  micGranted: "pub:live:mic-granted",
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

export function useLivePreferences() {
  const [autoOpenCanvas, setAutoOpenCanvas] = useState(() =>
    readStoredBoolean(STORAGE_KEYS.autoOpenCanvas, true),
  );
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
    window.localStorage.setItem(STORAGE_KEYS.voiceModeEnabled, voiceModeEnabled ? "1" : "0");
  }, [voiceModeEnabled]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.micGranted, micGranted ? "1" : "0");
  }, [micGranted]);

  return {
    autoOpenCanvas,
    setAutoOpenCanvas,
    voiceModeEnabled,
    setVoiceModeEnabled,
    micGranted,
    setMicGranted,
  };
}
