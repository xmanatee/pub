import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { AUTH_TABLES, PUB_OWNED_TABLES, USER_OWNED_TABLES } from "./user_data";

const testingSrc = readFileSync(resolve(__dirname, "testing.ts"), "utf-8");

const schema = readFileSync(resolve(__dirname, "schema.ts"), "utf-8");

function findTablesWithField(field: string, excludeTable: string): string[] {
  const tableStarts = [...schema.matchAll(/^ {2}(\w+):\s*defineTable\(\{/gm)];
  const result: string[] = [];
  for (const match of tableStarts) {
    const name = match[1];
    if (name === excludeTable) continue;
    const startIdx = match.index ?? 0;
    const nextTable = schema.slice(startIdx + 1).search(/\n {2}\w+:\s*defineTable\(/);
    const block =
      nextTable === -1 ? schema.slice(startIdx) : schema.slice(startIdx, startIdx + 1 + nextTable);
    if (block.includes(field)) {
      result.push(name);
    }
  }
  return result;
}

function assertIndexExists(entries: readonly { table: string; index: string }[]): void {
  for (const { table, index } of entries) {
    const pattern = new RegExp(`${table}:.*\\.index\\("${index}"`, "s");
    expect(pattern.test(schema), `Table "${table}" is missing index "${index}" in schema`).toBe(
      true,
    );
  }
}

describe("USER_OWNED_TABLES", () => {
  it("has no duplicate entries", () => {
    const tables = USER_OWNED_TABLES.map((t) => t.table);
    expect(new Set(tables).size).toBe(tables.length);
  });

  it("covers every user-owned table in the schema", () => {
    const tablesWithUserId = findTablesWithField("userId", "users");
    expect(tablesWithUserId.length).toBeGreaterThan(0);

    // Tables in PUB_OWNED_TABLES are transitively covered: pub cascade runs
    // before user-owned row deletion during account delete.
    const pubOwned = new Set<string>(PUB_OWNED_TABLES.map((t) => t.table));
    const registered = new Set<string>(USER_OWNED_TABLES.map((t) => t.table));
    for (const table of tablesWithUserId) {
      expect(
        registered.has(table) || pubOwned.has(table),
        `Table "${table}" has userId but is missing from USER_OWNED_TABLES and PUB_OWNED_TABLES`,
      ).toBe(true);
    }
  });

  it("every entry has the required index declared in the schema", () => {
    assertIndexExists(USER_OWNED_TABLES);
  });
});

describe("PUB_OWNED_TABLES", () => {
  it("has no duplicate entries", () => {
    const tables = PUB_OWNED_TABLES.map((t) => t.table);
    expect(new Set(tables).size).toBe(tables.length);
  });

  it("covers every pub-owned table in the schema", () => {
    const tablesWithPubId = findTablesWithField('v.id("pubs")', "pubs");
    expect(tablesWithPubId.length).toBeGreaterThan(0);

    const registered = new Set<string>(PUB_OWNED_TABLES.map((t) => t.table));
    for (const table of tablesWithPubId) {
      expect(
        registered.has(table),
        `Table "${table}" has pubId but is missing from PUB_OWNED_TABLES`,
      ).toBe(true);
    }
  });

  it("every entry has the required index declared in the schema", () => {
    assertIndexExists(PUB_OWNED_TABLES);
  });
});

describe("ownership registries", () => {
  it("USER_OWNED_TABLES and PUB_OWNED_TABLES have no overlap", () => {
    const userOwned = new Set<string>(USER_OWNED_TABLES.map((t) => t.table));
    for (const { table } of PUB_OWNED_TABLES) {
      expect(userOwned.has(table), `"${table}" is in both USER_OWNED and PUB_OWNED`).toBe(false);
    }
  });

  it("AUTH_TABLES has no overlap with USER_OWNED_TABLES", () => {
    const userOwned = new Set<string>(USER_OWNED_TABLES.map((t) => t.table));
    for (const authTable of AUTH_TABLES) {
      expect(userOwned.has(authTable), `"${authTable}" is in both lists`).toBe(false);
    }
  });
});

describe("clearAll coverage", () => {
  it("imports USER_OWNED_TABLES for clearing", () => {
    expect(testingSrc).toContain("USER_OWNED_TABLES");
  });

  it("imports PUB_OWNED_TABLES for clearing", () => {
    expect(testingSrc).toContain("PUB_OWNED_TABLES");
  });

  it("imports AUTH_TABLES for clearing", () => {
    expect(testingSrc).toContain("AUTH_TABLES");
  });
});
