import {
  backButton,
  initData,
  isTMA,
  miniApp,
  openLink,
  popup,
  retrieveLaunchParams,
  retrieveRawInitData,
  swipeBehavior,
  themeParams,
  init as tmaInit,
  viewport,
} from "@telegram-apps/sdk-react";

function hasWindow(): boolean {
  return typeof window !== "undefined";
}

export const IN_TELEGRAM = isTMA();

function readLaunchParams(): {
  tgWebAppStartParam?: string;
} | null {
  if (!IN_TELEGRAM) return null;
  try {
    return retrieveLaunchParams();
  } catch {
    return null;
  }
}

export function getTelegramInitData(): string | null {
  if (!IN_TELEGRAM) return null;
  try {
    return retrieveRawInitData() ?? null;
  } catch {
    return null;
  }
}

export function telegramOpenLink(url: string): void {
  if (!hasWindow()) return;
  if (IN_TELEGRAM && openLink.isAvailable()) {
    openLink(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

export async function telegramConfirm(message: string): Promise<boolean> {
  if (!hasWindow()) return false;
  if (!IN_TELEGRAM || !popup.show.isAvailable()) return window.confirm(message);
  try {
    const id = await popup.show({
      message,
      buttons: [
        { id: "yes", type: "destructive", text: "Yes" },
        { id: "no", type: "cancel" },
      ],
    });
    return id === "yes";
  } catch {
    return window.confirm(message);
  }
}

export function getTelegramStartParam(): string | null {
  return readLaunchParams()?.tgWebAppStartParam ?? null;
}

export function parseStartParam(startParam: string): { path: string } | null {
  // Legacy prefix format
  if (startParam.startsWith("p_") && startParam.length > 2)
    return { path: `/p/${startParam.slice(2)}` };
  // New format: just the slug
  if (startParam.length > 0 && !startParam.includes("/")) return { path: `/p/${startParam}` };
  return null;
}

export function initTelegramSdk(): void {
  if (!hasWindow() || !IN_TELEGRAM) return;

  tmaInit();
  initData.restore();

  miniApp.mountSync.ifAvailable();
  themeParams.mountSync.ifAvailable();
  themeParams.bindCssVars.ifAvailable();
  backButton.mount.ifAvailable();
  swipeBehavior.mount.ifAvailable();

  if (viewport.mount.isAvailable()) {
    void viewport.mount().then(() => {
      viewport.bindCssVars.ifAvailable();
    });
  }

  swipeBehavior.disableVertical.ifAvailable();
  viewport.expand.ifAvailable();
  if (viewport.requestFullscreen.isAvailable()) {
    void viewport.requestFullscreen();
  }

  document.documentElement.classList.toggle("dark", miniApp.isDark());

  miniApp.ready.ifAvailable();
}
