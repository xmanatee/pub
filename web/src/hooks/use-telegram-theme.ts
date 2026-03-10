import { miniApp, useSignal } from "@telegram-apps/sdk-react";
import { useEffect } from "react";
import { IN_TELEGRAM } from "~/lib/telegram";

export function useTelegramTheme(): void {
  const isDark = useSignal(miniApp.isDark);

  useEffect(() => {
    if (!IN_TELEGRAM) return;
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);
}
