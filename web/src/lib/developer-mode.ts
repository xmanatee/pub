import { hasWindow } from "./has-window";

const STORAGE_KEY = "pub.developer-mode";
const CHANGE_EVENT = "pub:developer-mode";

declare global {
  interface Window {
    __pubDeveloperModeInitialized?: boolean;
  }
}

function emitDeveloperModeChange(enabled: boolean) {
  if (!hasWindow()) return;
  window.dispatchEvent(
    new CustomEvent<{ enabled: boolean }>(CHANGE_EVENT, {
      detail: { enabled },
    }),
  );
}

export function isDeveloperModeEnabled(): boolean {
  if (!hasWindow()) return false;
  return window.localStorage.getItem(STORAGE_KEY) === "1";
}

export function setDeveloperModeEnabled(enabled: boolean): void {
  if (!hasWindow()) return;
  if (enabled) {
    window.localStorage.setItem(STORAGE_KEY, "1");
  } else {
    window.localStorage.removeItem(STORAGE_KEY);
  }
  emitDeveloperModeChange(enabled);
}

export function subscribeDeveloperMode(handler: (enabled: boolean) => void): () => void {
  if (!hasWindow()) return () => {};

  const onCustomEvent = (event: Event) => {
    const enabled = (event as CustomEvent<{ enabled: boolean }>).detail.enabled;
    handler(enabled);
  };

  const onStorageEvent = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    handler(isDeveloperModeEnabled());
  };

  window.addEventListener(CHANGE_EVENT, onCustomEvent);
  window.addEventListener("storage", onStorageEvent);

  return () => {
    window.removeEventListener(CHANGE_EVENT, onCustomEvent);
    window.removeEventListener("storage", onStorageEvent);
  };
}

export function initDeveloperMode(): void {
  if (!hasWindow()) return;

  if (!window.__pubDeveloperModeInitialized) {
    window.__pubDeveloperModeInitialized = true;
    window.addEventListener("error", (event) => {
      console.error("[app:error]", event.error ?? event.message, {
        colno: event.colno,
        filename: event.filename,
        lineno: event.lineno,
      });
    });
    window.addEventListener("unhandledrejection", (event) => {
      console.error("[app:unhandledrejection]", event.reason);
    });
  }
}
