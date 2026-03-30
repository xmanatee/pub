import { useCallback, useEffect, useState } from "react";

export function isFullscreenSupported(): boolean {
  return typeof document.documentElement.requestFullscreen === "function";
}

export function useFullscreen() {
  const isSupported = isFullscreenSupported();

  const [isFullscreen, setIsFullscreen] = useState(
    () => isSupported && document.fullscreenElement !== null,
  );

  useEffect(() => {
    if (!isSupported) return;
    const handler = () => setIsFullscreen(document.fullscreenElement !== null);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, [isSupported]);

  const requestFullscreen = useCallback(() => {
    if (!isSupported || document.fullscreenElement) return;
    void document.documentElement.requestFullscreen();
  }, [isSupported]);

  const exitFullscreen = useCallback(() => {
    if (!isSupported || !document.fullscreenElement) return;
    void document.exitFullscreen();
  }, [isSupported]);

  return { isSupported, isFullscreen, requestFullscreen, exitFullscreen };
}
