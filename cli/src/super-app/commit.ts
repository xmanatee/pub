/**
 * Validation gate for agent-driven edits. `pub commit "<description>"`
 * invokes the super-app's declared npm scripts in order. If a script is
 * missing from `package.json`, the step is skipped — super-app owns which
 * checks it exposes; pub just runs whatever is declared.
 *
 * Future: on success, git-commit the change and restart the served app.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface CommitStep {
  /** The package.json script name to invoke via `<pm> run <script>`. */
  script: string;
}

/**
 * Order matters for agent UX: cheap static checks before the expensive build,
 * tests before the build so a broken test is surfaced without waiting for a
 * full bundle.
 */
export const DEFAULT_COMMIT_STEPS: readonly CommitStep[] = [
  { script: "typecheck" },
  { script: "lint" },
  { script: "test" },
  { script: "build" },
];

export type StepOutcome =
  | { script: string; status: "passed" }
  | { script: string; status: "skipped"; reason: string }
  | { script: string; status: "failed"; exitCode: number };

export function runSuperAppCommit(params: {
  dir: string;
  packageManager: string;
  steps: readonly CommitStep[];
}): StepOutcome[] {
  const declared = readDeclaredScripts(params.dir);
  const outcomes: StepOutcome[] = [];
  for (const step of params.steps) {
    if (!declared.has(step.script)) {
      console.log(`\n━━ ${step.script}: skipped (not declared in package.json) ━━`);
      outcomes.push({ script: step.script, status: "skipped", reason: "not declared" });
      continue;
    }
    console.log(`\n━━ ${step.script}: ${params.packageManager} run ${step.script} ━━`);
    const result = spawnSync(params.packageManager, ["run", step.script], {
      cwd: params.dir,
      stdio: "inherit",
    });
    if (result.status !== 0) {
      outcomes.push({ script: step.script, status: "failed", exitCode: result.status ?? 1 });
      return outcomes;
    }
    outcomes.push({ script: step.script, status: "passed" });
  }
  return outcomes;
}

function readDeclaredScripts(dir: string): Set<string> {
  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as {
    scripts?: Record<string, string>;
  };
  return new Set(Object.keys(pkg.scripts ?? {}));
}
