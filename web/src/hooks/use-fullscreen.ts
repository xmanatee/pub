import { useCallback, useEffect, useState } from "react";

export function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(() => document.fullscreenElement !== null);

  useEffect(() => {
    const handler = () => setIsFullscreen(document.fullscreenElement !== null);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const requestFullscreen = useCallback(() => {
    if (document.fullscreenElement) return;
    void document.documentElement.requestFullscreen();
  }, []);

  const exitFullscreen = useCallback(() => {
    if (!document.fullscreenElement) return;
    void document.exitFullscreen();
  }, []);

  return { isFullscreen, requestFullscreen, exitFullscreen };
}
