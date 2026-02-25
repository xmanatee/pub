interface TelegramWebApp {
  initData: string;
  initDataUnsafe: {
    user?: {
      id: number;
      first_name: string;
      last_name?: string;
      username?: string;
      photo_url?: string;
    };
  };
  openLink(url: string): void;
  close(): void;
  ready(): void;
}

interface Window {
  Telegram?: {
    WebApp?: TelegramWebApp;
  };
}
