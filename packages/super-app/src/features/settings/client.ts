import {
  type CONFIG_PATH,
  getFeatureConfig,
  listFeatureConfigKeys,
  setFeatureConfig,
} from "~/core/config";
import type { JsonValue } from "~/core/types";

export type { CONFIG_PATH };

export const settingsApi = {
  getKeys: (): Promise<string[]> => listFeatureConfigKeys(),
  get: (name: string): Promise<JsonValue | null> => getFeatureConfig({ data: { name } }),
  set: (name: string, value: JsonValue | null): Promise<{ ok: true }> =>
    setFeatureConfig({ data: { name, value } }),
};
