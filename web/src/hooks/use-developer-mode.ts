import { api } from "@backend/_generated/api";
import { useQuery } from "convex/react";
import { useCallback, useEffect, useState } from "react";
import {
  isDeveloperModeEnabled,
  setDeveloperModeEnabled as setDeveloperModePreference,
  subscribeDeveloperMode,
} from "~/lib/developer-mode";

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
