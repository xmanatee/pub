import { miniApp, useSignal } from "@telegram-apps/sdk-react";
import { useEffect, useSyncExternalStore } from "react";
import { IN_TELEGRAM } from "./telegram";

const DARK_CLASS = "dark";
const SYSTEM_DARK_QUERY = "(prefers-color-scheme: dark)";

function applyDarkClass(isDark: boolean): void {
  document.documentElement.classList.toggle(DARK_CLASS, isDark);
}

function resolveIsDark(): boolean {
  if (IN_TELEGRAM) return miniApp.isDark();
  return window.matchMedia(SYSTEM_DARK_QUERY).matches;
}

/** Call before React mount to prevent a flash of wrong theme on first paint. */
export function initTheme(): void {
  applyDarkClass(resolveIsDark());
}

function useSystemIsDark(): boolean {
  return useSyncExternalStore(
    (notify) => {
      const mq = window.matchMedia(SYSTEM_DARK_QUERY);
      mq.addEventListener("change", notify);
      return () => mq.removeEventListener("change", notify);
    },
    () => window.matchMedia(SYSTEM_DARK_QUERY).matches,
    () => false,
  );
}

function useTelegramThemeSync(): void {
  const isDark = useSignal(miniApp.isDark);
  useEffect(() => {
    applyDarkClass(isDark);
  }, [isDark]);
}

function useSystemThemeSync(): void {
  const isDark = useSystemIsDark();
  useEffect(() => {
    applyDarkClass(isDark);
  }, [isDark]);
}

export const useThemeSync: () => void = IN_TELEGRAM ? useTelegramThemeSync : useSystemThemeSync;
