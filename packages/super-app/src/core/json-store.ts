/**
 * Tiny JSON-array store used by tracker / notes / tasks. Lives in
 * `~/.pub-super-app/<file>.json`. Exposes a single factory consumed by each
 * feature's `server.ts` — no copy-paste of load/save logic.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface StoreEntry {
  id: string;
  createdAt: number;
  updatedAt: number | null;
}

function expand(p: string): string {
  if (p.startsWith("~/")) return join(homedir(), p.slice(2));
  return p;
}

export function createJsonStore<T extends StoreEntry>(relativePath: string) {
  const file = expand(relativePath);

  const load = async (): Promise<T[]> => {
    try {
      const raw = await readFile(file, "utf8");
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    }
  };

  const save = async (entries: T[]): Promise<void> => {
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(entries, null, 2));
  };

  const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  return {
    async list(): Promise<T[]> {
      const entries = await load();
      entries.sort((a, b) => b.createdAt - a.createdAt);
      return entries;
    },
    async append(fields: Partial<T>): Promise<T> {
      const entries = await load();
      const entry = { id: uid(), createdAt: Date.now(), updatedAt: null, ...fields } as T;
      entries.push(entry);
      await save(entries);
      return entry;
    },
    async update(id: string, patch: Partial<T>): Promise<T> {
      const entries = await load();
      const idx = entries.findIndex((e) => e.id === id);
      if (idx === -1) throw new Error(`no entry with id=${id}`);
      entries[idx] = { ...entries[idx], ...patch, updatedAt: Date.now() } as T;
      await save(entries);
      return entries[idx];
    },
    async remove(id: string): Promise<void> {
      const entries = await load();
      await save(entries.filter((e) => e.id !== id));
    },
  };
}
