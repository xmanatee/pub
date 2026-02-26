import {
  backButton,
  init,
  initData,
  isTMA,
  miniApp,
  openLink,
  popup,
  swipeBehavior,
  themeParams,
  viewport,
} from "@telegram-apps/sdk-react";

export const IN_TELEGRAM = isTMA();

export function getTelegramInitData(): string | null {
  return initData.raw() ?? null;
}

export function telegramOpenLink(url: string): void {
  if (openLink.isAvailable()) {
    openLink(url);
  } else {
    window.open(url, "_blank");
  }
}

export async function telegramConfirm(message: string): Promise<boolean> {
  if (!popup.show.isAvailable()) return confirm(message);
  const id = await popup.show({
    message,
    buttons: [
      { id: "yes", type: "destructive", text: "Yes" },
      { id: "no", type: "cancel" },
    ],
  });
  return id === "yes";
}

export function initTelegramSdk(): void {
  if (!IN_TELEGRAM) return;

  init();
  initData.restore();

  if (backButton.mount.isAvailable()) backButton.mount();
  if (miniApp.mountSync.isAvailable()) miniApp.mountSync();
  if (themeParams.mountSync.isAvailable()) themeParams.mountSync();
  if (swipeBehavior.mount.isAvailable()) swipeBehavior.mount();

  if (themeParams.bindCssVars.isAvailable()) themeParams.bindCssVars();
  if (miniApp.bindCssVars.isAvailable()) miniApp.bindCssVars();

  if (swipeBehavior.disableVertical.isAvailable()) swipeBehavior.disableVertical();

  if (viewport.mount.isAvailable()) {
    void viewport.mount().then(() => {
      if (viewport.bindCssVars.isAvailable()) viewport.bindCssVars();
      if (viewport.requestFullscreen.isAvailable()) {
        viewport.requestFullscreen().catch(() => {});
      }
    });
  }

  if (miniApp.ready.isAvailable()) miniApp.ready();
}
