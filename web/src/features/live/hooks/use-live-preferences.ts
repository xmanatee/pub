import { useEffect, useState } from "react";

const STORAGE_KEYS = {
  autoFullscreen: "pub:live:auto-fullscreen",
  autoOpenCanvas: "pub:live:auto-open-canvas",
  defaultAgentName: "pub:live:default-agent",
  liveProfilesByAgent: "pub:live:profiles-by-agent",
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

function readStoredStringRecord(
  key: string,
  getItem: GetItem = defaultGetItem,
): Record<string, string> {
  const raw = getItem(key);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
  } catch {
    return {};
  }
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
  const [liveProfilesByAgent, setLiveProfilesByAgent] = useState(() =>
    readStoredStringRecord(STORAGE_KEYS.liveProfilesByAgent),
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

  useEffect(() => {
    window.localStorage.setItem(
      STORAGE_KEYS.liveProfilesByAgent,
      JSON.stringify(liveProfilesByAgent),
    );
  }, [liveProfilesByAgent]);

  function setLiveProfileForAgent(agentName: string, profileId: string | null) {
    setLiveProfilesByAgent((current) => {
      const next = { ...current };
      if (profileId === null) delete next[agentName];
      else next[agentName] = profileId;
      return next;
    });
  }

  return {
    autoFullscreen,
    autoOpenCanvas,
    defaultAgentName,
    liveProfilesByAgent,
    setAutoFullscreen,
    setAutoOpenCanvas,
    setDefaultAgentName,
    setLiveProfileForAgent,
    voiceModeEnabled,
    setVoiceModeEnabled,
  };
}
