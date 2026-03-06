import { useQuery } from "convex/react";
import { useCallback, useEffect, useState } from "react";
import {
  isDeveloperModeEnabled,
  setDeveloperModeEnabled as setDeveloperModePreference,
  subscribeDeveloperMode,
} from "~/lib/developer-mode";
import { api } from "../../convex/_generated/api";

export function useDeveloperMode() {
  const canUseDeveloperMode = useQuery(api.users.isDeveloper) === true;

  const [developerModeEnabled, setDeveloperModeEnabledState] = useState(() =>
    isDeveloperModeEnabled(),
  );

  useEffect(() => subscribeDeveloperMode(setDeveloperModeEnabledState), []);

  const setDeveloperModeEnabled = useCallback((value: boolean) => {
    setDeveloperModeEnabledState(value);
    setDeveloperModePreference(value);
  }, []);

  return {
    canUseDeveloperMode,
    developerModeEnabled: canUseDeveloperMode && developerModeEnabled,
    setDeveloperModeEnabled,
  };
}
