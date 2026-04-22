import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runSuperAppCommit } from "./commit.js";

/**
 * Stubs `<pm> run <script>` by writing a fake package manager that looks at
 * `args[1]` (the script name) and exits with the code we configured.
 */
function seedFakeWorkspace(
  dir: string,
  params: { scripts: Record<string, string>; scriptExitCodes: Record<string, number> },
) {
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ name: "pub-super-app", scripts: params.scripts }),
  );
  const exitMap = JSON.stringify(params.scriptExitCodes);
  const pmPath = join(dir, "fake-pm");
  writeFileSync(
    pmPath,
    [
      "#!/usr/bin/env node",
      `const exits = ${exitMap};`,
      "process.exit(exits[process.argv[3]] ?? 0);",
    ].join("\n"),
  );
  chmodSync(pmPath, 0o755);
  return pmPath;
}

describe("runSuperAppCommit", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "commit-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("invokes each declared script in order and returns passed outcomes", () => {
    const pm = seedFakeWorkspace(dir, {
      scripts: { typecheck: "...", lint: "...", build: "..." },
      scriptExitCodes: {},
    });
    const outcomes = runSuperAppCommit({
      dir,
      packageManager: pm,
      steps: [{ script: "typecheck" }, { script: "lint" }, { script: "build" }],
    });
    expect(outcomes.map((o) => [o.script, o.status])).toEqual([
      ["typecheck", "passed"],
      ["lint", "passed"],
      ["build", "passed"],
    ]);
  });

  it("skips steps whose script is not declared in package.json", () => {
    const pm = seedFakeWorkspace(dir, {
      scripts: { typecheck: "..." },
      scriptExitCodes: {},
    });
    const outcomes = runSuperAppCommit({
      dir,
      packageManager: pm,
      steps: [{ script: "typecheck" }, { script: "lint" }, { script: "test" }],
    });
    expect(outcomes).toEqual([
      { script: "typecheck", status: "passed" },
      { script: "lint", status: "skipped", reason: "not declared" },
      { script: "test", status: "skipped", reason: "not declared" },
    ]);
  });

  it("short-circuits on the first failing script", () => {
    const pm = seedFakeWorkspace(dir, {
      scripts: { typecheck: "...", lint: "...", build: "..." },
      scriptExitCodes: { lint: 2 },
    });
    const outcomes = runSuperAppCommit({
      dir,
      packageManager: pm,
      steps: [{ script: "typecheck" }, { script: "lint" }, { script: "build" }],
    });
    expect(outcomes).toEqual([
      { script: "typecheck", status: "passed" },
      { script: "lint", status: "failed", exitCode: 2 },
    ]);
  });
});
