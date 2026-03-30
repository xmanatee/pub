import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useControlBarLayer } from "~/components/control-bar/control-bar-controller";
import type { ControlBarLayerConfig } from "~/components/control-bar/control-bar-types";
import { useLiveSession } from "~/features/pub/contexts/live-session-context";
import { useFullscreen } from "~/hooks/use-fullscreen";
import { IN_TELEGRAM } from "~/lib/telegram";
import { ControlBarFullscreenPromptMode } from "./control-bar-fullscreen-prompt-mode";

interface FullscreenPromptLayerProps {
  slug: string;
}

export function FullscreenPromptLayer({ slug }: FullscreenPromptLayerProps) {
  const { autoFullscreen } = useLiveSession();
  const { isSupported, isFullscreen, requestFullscreen } = useFullscreen();
  const [dismissed, setDismissed] = useState(false);
  const lastSlugRef = useRef(slug);

  useEffect(() => {
    if (lastSlugRef.current !== slug) {
      lastSlugRef.current = slug;
      setDismissed(false);
    }
  }, [slug]);

  const shouldShow = isSupported && !IN_TELEGRAM && autoFullscreen && !isFullscreen && !dismissed;

  const handleDismiss = useCallback(() => setDismissed(true), []);

  const handleFullscreen = useCallback(() => {
    requestFullscreen();
    setDismissed(true);
  }, [requestFullscreen]);

  const layer: ControlBarLayerConfig | null = useMemo(
    () =>
      shouldShow
        ? {
            mainContent: (
              <ControlBarFullscreenPromptMode
                onDismiss={handleDismiss}
                onFullscreen={handleFullscreen}
              />
            ),
          }
        : null,
    [shouldShow, handleDismiss, handleFullscreen],
  );

  useControlBarLayer(layer);

  return null;
}
