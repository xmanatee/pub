interface TelegramBotInfo {
  username: string;
  hasMainWebApp: boolean;
}

export async function telegramGetMe(token: string): Promise<TelegramBotInfo> {
  const resp = await fetch(`https://api.telegram.org/bot${token}/getMe`);
  const data = (await resp.json()) as {
    ok: boolean;
    result?: { username: string; has_main_web_app?: boolean };
    description?: string;
  };
  if (!data.ok || !data.result?.username) {
    throw new Error(data.description ?? "Invalid bot token");
  }
  return {
    username: data.result.username,
    hasMainWebApp: data.result.has_main_web_app === true,
  };
}

export async function telegramSetMenuButton(token: string, button: object): Promise<void> {
  const resp = await fetch(`https://api.telegram.org/bot${token}/setChatMenuButton`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ menu_button: button }),
  });
  const data = (await resp.json()) as { ok: boolean; description?: string };
  if (!data.ok) {
    throw new Error(data.description ?? "setChatMenuButton failed");
  }
}
