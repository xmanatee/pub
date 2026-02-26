import { useMatches, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { getTelegramWebApp, IN_TELEGRAM } from "~/lib/telegram";

export function useTelegramBackButton(): void {
  const matches = useMatches();
  const navigate = useNavigate();
  const router = useRouter();

  useEffect(() => {
    const webApp = getTelegramWebApp();
    const backButton = webApp?.BackButton;
    if (!IN_TELEGRAM || !backButton) return;

    const isRoot = matches.length <= 2;

    if (isRoot) {
      backButton.hide();
    } else {
      backButton.show();
    }

    const handleBack = () => {
      if (window.history.length > 1) {
        router.history.back();
      } else {
        navigate({ to: "/" });
      }
    };
    backButton.onClick(handleBack);

    return () => {
      backButton.offClick(handleBack);
    };
  }, [matches.length, navigate, router]);
}
