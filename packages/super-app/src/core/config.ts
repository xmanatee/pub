/**
 * Per-feature runtime config. Features declare their own shape and read it
 * via `getFeatureConfig(name)`. Backing file: `~/.pub-super-app/config.json`.
 * This keeps credentials off environment variables and out of the build —
 * adding a new feature is purely a code change.
 *
 * Example:
 *   {
 *     "telegram": { "apiId": 1234567, "apiHash": "..." },
 *     "whatsapp": { "token": "..." }
 *   }
 */
import { readFile } from "node:fs/promises";
import { createServerFn } from "@tanstack/react-start";
import { expandHome } from "./paths";
import type { JsonValue } from "./types";

export const CONFIG_PATH = "~/.pub-super-app/config.json";

async function loadConfig(): Promise<Record<string, JsonValue>> {
  try {
    const raw = await readFile(expandHome(CONFIG_PATH), "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, JsonValue>)
      : {};
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw err;
  }
}

export const getFeatureConfig = createServerFn({ method: "GET" })
  .inputValidator((input: { name: string }) => input)
  .handler(async ({ data }): Promise<JsonValue | null> => {
    const doc = await loadConfig();
    return doc[data.name] ?? null;
  });
