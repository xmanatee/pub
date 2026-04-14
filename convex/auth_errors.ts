import { ConvexError } from "convex/values";

export const TELEGRAM_ACCOUNT_NOT_LINKED = "TELEGRAM_ACCOUNT_NOT_LINKED" as const;

type TelegramNotLinkedData = { code: typeof TELEGRAM_ACCOUNT_NOT_LINKED };

export function telegramNotLinkedError(): ConvexError<TelegramNotLinkedData> {
  return new ConvexError({ code: TELEGRAM_ACCOUNT_NOT_LINKED });
}

export function isTelegramNotLinkedError(error: unknown): boolean {
  if (!(error instanceof ConvexError)) return false;
  const data = error.data as unknown;
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { code?: unknown }).code === TELEGRAM_ACCOUNT_NOT_LINKED
  );
}
