import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth } from "convex/react";
import * as React from "react";
import { trackSignIn, trackSignInStarted } from "~/lib/analytics";
import { getTelegramInitData, IN_TELEGRAM } from "~/lib/telegram";

function readInitData(): string | null {
  if (!IN_TELEGRAM) return null;
  try {
    return getTelegramInitData();
  } catch {
    return null;
  }
}

export function useTelegramAuth(): { telegramPending: boolean } {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signIn } = useAuthActions();
  const [initData] = React.useState(readInitData);
  const [telegramPending, setTelegramPending] = React.useState(initData !== null);
  const attemptedRef = React.useRef(false);

  React.useEffect(() => {
    if (!initData) return;
    if (isLoading) return;
    if (isAuthenticated) {
      setTelegramPending(false);
      return;
    }
    if (attemptedRef.current) return;

    attemptedRef.current = true;
    trackSignInStarted("telegram");

    void signIn("telegram", { initData })
      .then(() => trackSignIn("telegram"))
      .catch(() => {})
      .finally(() => setTelegramPending(false));
  }, [initData, isLoading, isAuthenticated, signIn]);

  return { telegramPending };
}
