function hasWindow(): boolean {
  return typeof window !== "undefined";
}

function isTelegramWebApp(value: unknown): value is TelegramWebApp {
  return (
    typeof value === "object" &&
    value !== null &&
    "ready" in value &&
    typeof (value as { ready?: unknown }).ready === "function"
  );
}

export function getTelegramWebApp(): TelegramWebApp | null {
  if (!hasWindow()) return null;
  const candidate = window.Telegram?.WebApp;
  return isTelegramWebApp(candidate) ? candidate : null;
}

export const IN_TELEGRAM = getTelegramWebApp() !== null;

export function getTelegramInitData(): string | null {
  return getTelegramWebApp()?.initData ?? null;
}

function setDocumentCssVar(name: string, value: number) {
  if (!hasWindow()) return;
  document.documentElement.style.setProperty(name, `${Math.max(0, value)}px`);
}

export function applyTelegramThemeClass(): void {
  const webApp = getTelegramWebApp();
  if (!webApp || !hasWindow()) return;
  document.documentElement.classList.toggle("dark", webApp.colorScheme === "dark");
}

export function applyTelegramSafeAreaVars(): void {
  const webApp = getTelegramWebApp();
  if (!webApp) return;

  const safeTop = webApp.safeAreaInset?.top ?? 0;
  const safeBottom = webApp.safeAreaInset?.bottom ?? 0;
  const contentTop = webApp.contentSafeAreaInset?.top ?? 0;
  const contentBottom = webApp.contentSafeAreaInset?.bottom ?? 0;

  setDocumentCssVar("--safe-top", safeTop + contentTop);
  setDocumentCssVar("--safe-bottom", safeBottom + contentBottom);
}

export function telegramOpenLink(url: string): void {
  const webApp = getTelegramWebApp();
  if (webApp?.openLink) {
    webApp.openLink(url);
    return;
  }
  if (!hasWindow()) return;
  window.open(url, "_blank", "noopener,noreferrer");
}

export async function telegramConfirm(message: string): Promise<boolean> {
  const webApp = getTelegramWebApp();
  const showPopup = webApp?.showPopup;
  if (!showPopup) {
    if (!hasWindow()) return false;
    return window.confirm(message);
  }

  return new Promise((resolve) => {
    showPopup(
      {
        message,
        buttons: [
          { id: "yes", type: "destructive", text: "Yes" },
          { id: "no", type: "cancel" },
        ],
      },
      (id: string | null) => resolve(id === "yes"),
    );
  });
}

export function initTelegramSdk(): void {
  const webApp = getTelegramWebApp();
  if (!webApp) return;

  applyTelegramThemeClass();
  applyTelegramSafeAreaVars();
  webApp.disableVerticalSwipes?.();
  webApp.expand?.();
  webApp.ready();
}
