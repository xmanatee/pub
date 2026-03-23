import { useCallback, useRef, useState } from "react";

export type ErrorThrottlePhase = "normal" | "suggest-pause" | "paused";

const SUGGEST_PAUSE_THRESHOLD = 4;
const AUTO_PAUSE_THRESHOLD = 10;

export interface ErrorThrottleActions {
  pause(): void;
  resume(): void;
  dismiss(): void;
  reset(): void;
}

export interface ErrorThrottleState {
  phase: ErrorThrottlePhase;
  errorCount: number;
  paused: boolean;
}

export type ErrorThrottle = ErrorThrottleState &
  ErrorThrottleActions & {
    recordError(): void;
  };

function derivePhase(count: number, manualPaused: boolean): ErrorThrottlePhase {
  if (manualPaused) return "paused";
  if (count >= AUTO_PAUSE_THRESHOLD) return "paused";
  if (count >= SUGGEST_PAUSE_THRESHOLD) return "suggest-pause";
  return "normal";
}

export function useErrorThrottle(): ErrorThrottle {
  const [errorCount, setErrorCount] = useState(0);
  const [manualPaused, setManualPaused] = useState(false);
  const countRef = useRef(0);

  const phase = derivePhase(errorCount, manualPaused);
  const paused = phase === "paused";

  const recordError = useCallback(() => {
    countRef.current += 1;
    setErrorCount(countRef.current);
  }, []);

  const pause = useCallback(() => {
    setManualPaused(true);
  }, []);

  const clear = useCallback(() => {
    countRef.current = 0;
    setErrorCount(0);
    setManualPaused(false);
  }, []);

  return {
    phase,
    errorCount,
    paused,
    recordError,
    pause,
    resume: clear,
    dismiss: clear,
    reset: clear,
  };
}
