/**
 * For every feature with both `server.ts` and `client.ts`, every server
 * function exported from `server.ts` must be referenced by name from
 * `client.ts`. Catches incomplete features (e.g. tasks/server.ts has
 * `createTask` but client.ts forgets to call it).
 */
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const FEATURES = new URL("../features", import.meta.url).pathname;

const EXPORT_FN_RE = /export\s+const\s+(\w+)\s*=\s*createServerFn/g;

async function readIfExists(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

describe("server-client-parity", () => {
  it("every server fn is reachable from its feature client", async () => {
    const dirs = await readdir(FEATURES);
    const violations: string[] = [];
    for (const name of dirs) {
      const dir = join(FEATURES, name);
      const s = await stat(dir);
      if (!s.isDirectory()) continue;
      const server = await readIfExists(join(dir, "server.ts"));
      const client = await readIfExists(join(dir, "client.ts"));
      if (!server || !client) continue;
      const exported: string[] = [];
      for (const m of server.matchAll(EXPORT_FN_RE)) exported.push(m[1]);
      for (const fn of exported) {
        if (!new RegExp(`\\b${fn}\\b`).test(client)) {
          violations.push(`${relative(FEATURES, dir)}: server fn ${fn} not used in client.ts`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
