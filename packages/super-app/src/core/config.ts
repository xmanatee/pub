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
import { homedir } from "node:os";
import { join } from "node:path";
import { createServerFn } from "@tanstack/react-start";

export const CONFIG_PATH = "~/.pub-super-app/config.json";

function expand(p: string): string {
  return p.startsWith("~/") ? join(homedir(), p.slice(2)) : p;
}

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

type ConfigDoc = { [key: string]: JsonValue };

async function loadConfig(): Promise<ConfigDoc> {
  try {
    const raw = await readFile(expand(CONFIG_PATH), "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as ConfigDoc)
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
    return Object.hasOwn(doc, data.name) ? (doc[data.name] ?? null) : null;
  });
