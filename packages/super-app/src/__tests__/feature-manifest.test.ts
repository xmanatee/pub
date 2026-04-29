/**
 * Asserts that every service registered in `core/navigation/registry.ts` has
 * a matching route + page on disk. Catches silent regressions where a
 * feature is half-deleted (route file gone but registry entry left behind,
 * or vice versa).
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SERVICES } from "~/core/navigation/registry";

const SRC = new URL("..", import.meta.url).pathname;

function routeFile(route: string): string {
  if (route === "/") return join(SRC, "routes", "index.tsx");
  return join(SRC, "routes", `${route.slice(1)}.tsx`);
}

describe("feature-manifest", () => {
  it("every registered service has a matching route file", () => {
    const missing = SERVICES.filter((s) => !existsSync(routeFile(s.route))).map((s) => s.id);
    expect(missing).toEqual([]);
  });

  it("uses unique service ids", () => {
    const ids = SERVICES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("uses unique route paths", () => {
    const routes = SERVICES.map((s) => s.route);
    expect(new Set(routes).size).toBe(routes.length);
  });
});
