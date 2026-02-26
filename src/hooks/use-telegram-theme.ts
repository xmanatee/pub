import { useEffect } from "react";
import {
  applyTelegramSafeAreaVars,
  applyTelegramThemeClass,
  getTelegramWebApp,
  IN_TELEGRAM,
} from "~/lib/telegram";

export function useTelegramTheme(): void {
  useEffect(() => {
    if (!IN_TELEGRAM) return;
    const webApp = getTelegramWebApp();
    if (!webApp) return;

    const apply = () => {
      applyTelegramThemeClass();
      applyTelegramSafeAreaVars();
    };

    apply();
    if (!webApp.onEvent) return;
    webApp.onEvent("themeChanged", apply);
    webApp.onEvent("viewportChanged", apply);

    return () => {
      webApp.offEvent?.("themeChanged", apply);
      webApp.offEvent?.("viewportChanged", apply);
    };
  }, []);
}
