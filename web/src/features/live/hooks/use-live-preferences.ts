import { useEffect, useState } from "react";

const STORAGE_KEYS = {
  autoFullscreen: "pub:live:auto-fullscreen",
  autoOpenCanvas: "pub:live:auto-open-canvas",
  defaultAgentName: "pub:live:default-agent",
  voiceModeEnabled: "pub:live:voice-mode-enabled",
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

export function readStoredString(key: string, getItem: GetItem = defaultGetItem): string | null {
  return getItem(key) ?? null;
}

export function useLivePreferences() {
  const [autoFullscreen, setAutoFullscreen] = useState(() =>
    readStoredBoolean(STORAGE_KEYS.autoFullscreen, true),
  );
  const [autoOpenCanvas, setAutoOpenCanvas] = useState(() =>
    readStoredBoolean(STORAGE_KEYS.autoOpenCanvas, true),
  );
  const [voiceModeEnabled, setVoiceModeEnabled] = useState(() =>
    readStoredBoolean(STORAGE_KEYS.voiceModeEnabled, false),
  );
  const [defaultAgentName, setDefaultAgentName] = useState(() =>
    readStoredString(STORAGE_KEYS.defaultAgentName),
  );

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.autoFullscreen, autoFullscreen ? "1" : "0");
  }, [autoFullscreen]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.autoOpenCanvas, autoOpenCanvas ? "1" : "0");
  }, [autoOpenCanvas]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.voiceModeEnabled, voiceModeEnabled ? "1" : "0");
  }, [voiceModeEnabled]);

  useEffect(() => {
    if (defaultAgentName === null) {
      window.localStorage.removeItem(STORAGE_KEYS.defaultAgentName);
    } else {
      window.localStorage.setItem(STORAGE_KEYS.defaultAgentName, defaultAgentName);
    }
  }, [defaultAgentName]);

  return {
    autoFullscreen,
    autoOpenCanvas,
    defaultAgentName,
    setAutoFullscreen,
    setAutoOpenCanvas,
    setDefaultAgentName,
    voiceModeEnabled,
    setVoiceModeEnabled,
  };
}
