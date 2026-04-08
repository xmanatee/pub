import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { PATH_ENV_VARS } from "./paths.js";

describe("PATH_ENV_VARS completeness", () => {
  it("covers every env var read in paths.ts", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "paths.ts"), "utf-8");

    const envVarPatterns = [
      /readAbsoluteEnvPath\(\s*"([^"]+)"/g, // readAbsoluteEnvPath("VAR", env)
      /envKey:\s*"([^"]+)"/g, // resolveXdgRoot({ envKey: "VAR", ... })
      /env\.([A-Z_]+)/g, // env.VAR direct access
    ];

    const allReferencedVars = new Set(
      envVarPatterns.flatMap((re) => [...source.matchAll(re)].map((m) => m[1])),
    );
    const declared = new Set<string>(PATH_ENV_VARS);

    const missing = [...allReferencedVars].filter((v) => !declared.has(v));
    const extra = [...declared].filter((v) => !allReferencedVars.has(v));

    expect(missing, "env vars read in paths.ts but missing from PATH_ENV_VARS").toEqual([]);
    expect(extra, "entries in PATH_ENV_VARS not referenced in paths.ts").toEqual([]);
  });
});
