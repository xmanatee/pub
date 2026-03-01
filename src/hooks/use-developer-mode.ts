import { useCallback, useEffect, useState } from "react";
import {
  isDeveloperModeEnabled,
  setDeveloperModeEnabled as setDeveloperModePreference,
  subscribeDeveloperMode,
} from "~/lib/developer-mode";

export function useDeveloperMode() {
  const [developerModeEnabled, setDeveloperModeEnabledState] = useState(() =>
    isDeveloperModeEnabled(),
  );

  useEffect(() => subscribeDeveloperMode(setDeveloperModeEnabledState), []);

  const setDeveloperModeEnabled = useCallback((value: boolean) => {
    setDeveloperModeEnabledState(value);
    setDeveloperModePreference(value);
  }, []);

  return {
    developerModeEnabled,
    setDeveloperModeEnabled,
  };
}
