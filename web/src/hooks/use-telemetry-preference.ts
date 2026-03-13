import { useCallback, useState } from "react";
import { isTelemetryEnabled, setTelemetryEnabled } from "~/lib/telemetry";

export function useTelemetryPreference() {
  const [enabled, setEnabled] = useState(isTelemetryEnabled);

  const toggle = useCallback((value: boolean) => {
    setTelemetryEnabled(value);
    setEnabled(value);
  }, []);

  return { telemetryEnabled: enabled, setTelemetryEnabled: toggle };
}
