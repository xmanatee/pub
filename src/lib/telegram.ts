export function isTelegramMiniApp(): boolean {
  return Boolean(window.Telegram?.WebApp?.initData);
}

export function getTelegramInitData(): string | null {
  return window.Telegram?.WebApp?.initData || null;
}
