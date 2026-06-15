import { expandHome } from "./paths";
import type { JsonValue } from "./types";

export const CONFIG_PATH = "~/.pub-super-app/config.json";

async function loadConfig(): Promise<Record<string, JsonValue>> {
  const { readFile } = await import("node:fs/promises");
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

export async function readFeatureConfig(name: string): Promise<JsonValue | null> {
  const doc = await loadConfig();
  return doc[name] ?? null;
}

async function writeDoc(doc: Record<string, JsonValue>): Promise<void> {
  const [{ mkdir, writeFile }, { dirname }] = await Promise.all([
    import("node:fs/promises"),
    import("node:path"),
  ]);
  const file = expandHome(CONFIG_PATH);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(doc, null, 2));
}

export async function writeFeatureConfig(name: string, value: JsonValue | null): Promise<void> {
  const doc = await loadConfig();
  if (value === null) delete doc[name];
  else doc[name] = value;
  await writeDoc(doc);
}

export async function listConfigKeys(): Promise<string[]> {
  const doc = await loadConfig();
  return Object.keys(doc).sort();
}
