import { isTelegramNotLinkedError } from "@backend/auth_errors";
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth } from "convex/react";
import * as React from "react";
import { trackError, trackSignIn, trackSignInStarted } from "~/lib/analytics";
import { pushAuthDebug } from "~/lib/auth-debug";
import { getTelegramInitData, IN_TELEGRAM } from "~/lib/telegram";

const TELEGRAM_INIT_DATA_RETRY_MS = 250;
const TELEGRAM_INIT_DATA_TIMEOUT_MS = 5000;

export interface TelegramAuthState {
  telegramPending: boolean;
  telegramNotLinked: boolean;
  createTelegramAccount: () => Promise<void>;
}

export function useTelegramAuth(): TelegramAuthState {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signIn } = useAuthActions();
  const [telegramPending, setTelegramPending] = React.useState(IN_TELEGRAM);
  const [telegramNotLinked, setTelegramNotLinked] = React.useState(false);
  const attemptedRef = React.useRef(false);
  const initDataRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!IN_TELEGRAM) return;
    if (isLoading) return;
    if (isAuthenticated) {
      setTelegramPending(false);
      return;
    }
    if (attemptedRef.current) return;

    let disposed = false;
    let intervalId: number | null = null;
    let timeoutId: number | null = null;

    const clearTimers = () => {
      if (intervalId !== null) window.clearInterval(intervalId);
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    };

    const trySignIn = () => {
      if (disposed || attemptedRef.current) return;
      const initData = getTelegramInitData();
      if (!initData) return;

      attemptedRef.current = true;
      initDataRef.current = initData;
      clearTimers();
      trackSignInStarted("telegram");
      pushAuthDebug("telegram_signin_start", { initDataLength: initData.length });

      void signIn("telegram", { initData })
        .then(() => {
          trackSignIn("telegram");
          pushAuthDebug("telegram_signin_success");
        })
        .catch((error) => {
          if (isTelegramNotLinkedError(error)) {
            pushAuthDebug("telegram_not_linked");
            setTelegramNotLinked(true);
            return;
          }
          trackError(error instanceof Error ? error : new Error(String(error)), {
            provider: "telegram",
          });
          pushAuthDebug("telegram_signin_error", error);
        })
        .finally(() => {
          if (!disposed) setTelegramPending(false);
        });
    };

    trySignIn();
    intervalId = window.setInterval(trySignIn, TELEGRAM_INIT_DATA_RETRY_MS);
    timeoutId = window.setTimeout(() => {
      clearTimers();
      if (attemptedRef.current) return;
      console.warn("Telegram sign-in skipped: initData not available");
      pushAuthDebug("telegram_init_data_missing", {
        timeoutMs: TELEGRAM_INIT_DATA_TIMEOUT_MS,
      });
      setTelegramPending(false);
    }, TELEGRAM_INIT_DATA_TIMEOUT_MS);

    return () => {
      disposed = true;
      clearTimers();
    };
  }, [isLoading, isAuthenticated, signIn]);

  const createTelegramAccount = React.useCallback(async () => {
    const initData = initDataRef.current;
    if (!initData) throw new Error("createTelegramAccount requires a prior sign-in attempt");

    await signIn("telegram", { initData, createAccount: true });
    setTelegramNotLinked(false);
  }, [signIn]);

  return { telegramPending, telegramNotLinked, createTelegramAccount };
}
