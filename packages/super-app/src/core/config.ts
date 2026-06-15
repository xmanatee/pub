import { createServerFn } from "@tanstack/react-start";
import type { JsonValue } from "./types";

export const CONFIG_PATH = "~/.pub-super-app/config.json";

export const getFeatureConfig = createServerFn({ method: "GET" })
  .inputValidator((input: { name: string }) => input)
  .handler(async ({ data }): Promise<JsonValue | null> => {
    const { readFeatureConfig } = await import("./config.server");
    return readFeatureConfig(data.name);
  });

export const setFeatureConfig = createServerFn({ method: "POST" })
  .inputValidator((input: { name: string; value: JsonValue | null }) => input)
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { writeFeatureConfig } = await import("./config.server");
    await writeFeatureConfig(data.name, data.value);
    return { ok: true };
  });

export const listFeatureConfigKeys = createServerFn({ method: "GET" }).handler(
  async (): Promise<string[]> => {
    const { listConfigKeys } = await import("./config.server");
    return listConfigKeys();
  },
);
