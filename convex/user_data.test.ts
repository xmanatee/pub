import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { AUTH_TABLES, USER_OWNED_TABLES } from "./user_data";

describe("USER_OWNED_TABLES", () => {
  it("has no duplicate entries", () => {
    const tables = USER_OWNED_TABLES.map((t) => t.table);
    expect(new Set(tables).size).toBe(tables.length);
  });

  it("covers every user-owned table in the schema", () => {
    const schema = readFileSync(resolve(__dirname, "schema.ts"), "utf-8");

    // Find all top-level table definitions: `  tableName: defineTable({`
    // The 2-space indent ensures we only match schema-level definitions.
    const tableStarts = [...schema.matchAll(/^ {2}(\w+):\s*defineTable\(\{/gm)];
    const tablesWithUserId: string[] = [];
    for (const match of tableStarts) {
      const name = match[1];
      if (name === "users") continue;
      // Extract the table's defineTable block (until the next top-level entry)
      const startIdx = match.index!;
      const nextTable = schema.slice(startIdx + 1).search(/\n {2}\w+:\s*defineTable\(/);
      const block =
        nextTable === -1
          ? schema.slice(startIdx)
          : schema.slice(startIdx, startIdx + 1 + nextTable);
      if (block.includes("userId")) {
        tablesWithUserId.push(name);
      }
    }

    const registered = new Set(USER_OWNED_TABLES.map((t) => t.table));
    for (const table of tablesWithUserId) {
      expect(
        registered.has(table),
        `Table "${table}" has userId but is missing from USER_OWNED_TABLES`,
      ).toBe(true);
    }

    expect(tablesWithUserId.length).toBeGreaterThan(0);
  });

  it("every entry has a by_user index declared in the schema", () => {
    const schema = readFileSync(resolve(__dirname, "schema.ts"), "utf-8");
    for (const { table, index } of USER_OWNED_TABLES) {
      const pattern = new RegExp(`${table}:.*\\.index\\("${index}"`, "s");
      expect(pattern.test(schema), `Table "${table}" is missing index "${index}" in schema`).toBe(
        true,
      );
    }
  });
});

describe("AUTH_TABLES", () => {
  it("has no overlap with USER_OWNED_TABLES", () => {
    const userOwned = new Set(USER_OWNED_TABLES.map((t) => t.table));
    for (const authTable of AUTH_TABLES) {
      expect(userOwned.has(authTable as string), `"${authTable}" is in both lists`).toBe(false);
    }
  });
});
