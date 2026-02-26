import { miniApp } from "@telegram-apps/sdk-react";
import { useEffect } from "react";
import { IN_TELEGRAM } from "~/lib/telegram";

export function useTelegramTheme(): void {
  useEffect(() => {
    if (!IN_TELEGRAM) return;

    const apply = (isDark: boolean) => {
      document.documentElement.classList.toggle("dark", isDark);
    };

    apply(miniApp.isDark());
    return miniApp.isDark.sub((current) => apply(current));
  }, []);
}
