import { useMatches, useNavigate, useRouter } from "@tanstack/react-router";
import { backButton } from "@telegram-apps/sdk-react";
import { useEffect } from "react";
import { IN_TELEGRAM } from "~/lib/telegram";

export function useTelegramBackButton(): void {
  const matches = useMatches();
  const navigate = useNavigate();
  const router = useRouter();

  useEffect(() => {
    if (!IN_TELEGRAM) return;

    const isRoot = matches.length <= 2;

    if (isRoot) {
      backButton.hide.ifAvailable();
    } else {
      backButton.show.ifAvailable();
    }

    if (!backButton.onClick.isAvailable()) return;

    const off = backButton.onClick(() => {
      if (window.history.length > 1) {
        router.history.back();
      } else {
        navigate({ to: "/" });
      }
    });

    return off;
  }, [matches.length, navigate, router]);
}
