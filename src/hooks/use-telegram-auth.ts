import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth } from "convex/react";
import * as React from "react";
import { trackError, trackSignIn, trackSignInStarted } from "~/lib/analytics";
import { pushAuthDebug } from "~/lib/auth-debug";
import { getTelegramInitData, IN_TELEGRAM } from "~/lib/telegram";

const TELEGRAM_INIT_DATA_RETRY_MS = 250;
const TELEGRAM_INIT_DATA_TIMEOUT_MS = 5000;

export function useTelegramAuth(): { telegramPending: boolean } {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signIn } = useAuthActions();
  const [telegramPending, setTelegramPending] = React.useState(IN_TELEGRAM);
  const attemptedRef = React.useRef(false);

  React.useEffect(() => {
    if (!IN_TELEGRAM) {
      setTelegramPending(false);
      return;
    }
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
      clearTimers();
      trackSignInStarted("telegram");
      pushAuthDebug("telegram_signin_start", {
        initDataLength: initData.length,
      });

      void signIn("telegram", { initData })
        .then(() => {
          trackSignIn("telegram");
          pushAuthDebug("telegram_signin_success");
        })
        .catch((error) => {
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
      if (!attemptedRef.current) {
        console.warn("Telegram sign-in skipped: initData not available");
        pushAuthDebug("telegram_init_data_missing", {
          timeoutMs: TELEGRAM_INIT_DATA_TIMEOUT_MS,
        });
        setTelegramPending(false);
      }
    }, TELEGRAM_INIT_DATA_TIMEOUT_MS);

    return () => {
      disposed = true;
      clearTimers();
    };
  }, [isLoading, isAuthenticated, signIn]);

  return { telegramPending };
}
