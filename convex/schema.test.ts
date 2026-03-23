import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SCHEMA_PATH = resolve(__dirname, "schema.ts");
const AGENTS_PATH = resolve(__dirname, "../AGENTS.md");

/**
 * Extract user-defined table names from schema.ts by matching defineTable calls.
 * Auth tables spread via `...otherAuthTables` are excluded — they're framework-managed.
 */
function parseSchemaTableNames(): string[] {
  const source = readFileSync(SCHEMA_PATH, "utf-8");
  const names: string[] = [];
  for (const match of source.matchAll(/^\s+(\w+):\s*defineTable\(/gm)) {
    names.push(match[1]);
  }
  return names.sort();
}

function readAgentsSchemaSection(): string {
  const source = readFileSync(AGENTS_PATH, "utf-8");
  const match = source.match(/\*\*Schema\*\*[^\n]+/);
  if (!match) throw new Error("Schema section not found in AGENTS.md");
  return match[0];
}

describe("AGENTS.md schema consistency", () => {
  it("mentions every user-defined table from schema.ts", () => {
    const tables = parseSchemaTableNames();
    const schemaLine = readAgentsSchemaSection();
    const missing = tables.filter((t) => !schemaLine.includes(`\`${t}\``));
    expect(missing, `Tables missing from AGENTS.md Schema section: ${missing.join(", ")}`).toEqual(
      [],
    );
  });

  it("does not reference removed tables", () => {
    const tables = new Set(parseSchemaTableNames());
    const schemaLine = readAgentsSchemaSection();
    // Table references in the schema line use the pattern: `tableName` (description...)
    // Extract only those — backtick-quoted words followed by space+open-paren or comma.
    const tableRefs = [...schemaLine.matchAll(/`(\w+)`\s*\(/g)].map((m) => m[1]);
    const stale = tableRefs.filter((name) => !tables.has(name));
    expect(stale, `Stale table references in AGENTS.md: ${stale.join(", ")}`).toEqual([]);
  });
});
