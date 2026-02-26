type TelegramWebAppEventName = "themeChanged" | "viewportChanged";

interface TelegramPopupButton {
  id?: string;
  type?: "default" | "ok" | "close" | "cancel" | "destructive";
  text?: string;
}

interface TelegramPopupParams {
  title?: string;
  message: string;
  buttons?: TelegramPopupButton[];
}

interface TelegramInsets {
  top?: number;
  bottom?: number;
}

interface TelegramBackButton {
  show(): void;
  hide(): void;
  onClick(handler: () => void): void;
  offClick(handler: () => void): void;
}

interface TelegramWebApp {
  initData: string;
  colorScheme?: "light" | "dark";
  openLink?(url: string): void;
  ready(): void;
  expand?(): void;
  disableVerticalSwipes?(): void;
  showPopup?(params: TelegramPopupParams, callback?: (buttonId: string | null) => void): void;
  onEvent?(eventType: TelegramWebAppEventName, handler: () => void): void;
  offEvent?(eventType: TelegramWebAppEventName, handler: () => void): void;
  BackButton?: TelegramBackButton;
  safeAreaInset?: TelegramInsets;
  contentSafeAreaInset?: TelegramInsets;
}

interface Window {
  Telegram?: {
    WebApp?: TelegramWebApp;
  };
}
