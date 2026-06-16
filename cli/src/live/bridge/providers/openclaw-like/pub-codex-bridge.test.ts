import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pub-codex-bridge-test-"));
  tempDirs.push(dir);
  return dir;
}

function createBridgeFixture(): {
  env: NodeJS.ProcessEnv;
  recordPath: string;
  scriptPath: string;
} {
  const dir = makeTempDir();
  const binDir = path.join(dir, "bin");
  const workspaceDir = path.join(dir, "workspace");
  const stateDir = path.join(dir, "state");
  const recordPath = path.join(dir, "codex-args.jsonl");
  fs.mkdirSync(binDir);
  fs.mkdirSync(workspaceDir);
  fs.mkdirSync(stateDir);

  fs.writeFileSync(
    path.join(binDir, "codex"),
    [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      'printf "%s\\n" "$(node -e \'console.log(JSON.stringify(process.argv.slice(1)))\' "$@")" >> "$CODEX_ARGS_RECORD"',
      'last_message=""',
      "while (($# > 0)); do",
      '  if [[ "$1" == "--output-last-message" ]]; then',
      "    shift",
      '    last_message="$1"',
      "  fi",
      "  shift || true",
      "done",
      'printf "ok\\n" > "$last_message"',
      'printf "%s\\n" \'{"type":"thread.started","thread_id":"session-1"}\'',
    ].join("\n"),
    { mode: 0o755 },
  );

  fs.writeFileSync(path.join(binDir, "pub"), "#!/usr/bin/env bash\nset -euo pipefail\nexit 0\n", {
    mode: 0o755,
  });

  return {
    env: {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH ?? ""}`,
      CODEX_ARGS_RECORD: recordPath,
      PUB_CODEX_STATE_DIR: stateDir,
      PUB_PROJECT_ROOT: workspaceDir,
    },
    recordPath,
    scriptPath: path.resolve("..", "scripts", "pub-codex-bridge"),
  };
}

function readRecordedCodexCalls(recordPath: string): string[][] {
  return fs
    .readFileSync(recordPath, "utf-8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as string[]);
}

describe("pub-codex-bridge", () => {
  it("runs Codex when the selected profile has no args", async () => {
    const { env, recordPath, scriptPath } = createBridgeFixture();

    await execFileAsync(scriptPath, ["Session started. [Live: demo]"], { env });

    const [call] = readRecordedCodexCalls(recordPath);

    expect(call[0]).toBe("exec");
    expect(call).not.toContain("--model");
    expect(call.at(-1)).toBe("Session started. [Live: demo]");
  });

  it("forwards profile args before the prompt for new and resumed Codex sessions", async () => {
    const { env, recordPath, scriptPath } = createBridgeFixture();

    await execFileAsync(scriptPath, ["--model", "fast-model", "Session started. [Live: demo]"], {
      env,
    });
    await execFileAsync(scriptPath, ["--model", "fast-model", "Next turn. [Live: demo]"], {
      env,
    });

    const calls = readRecordedCodexCalls(recordPath);

    expect(calls[0].slice(0, 3)).toEqual(["exec", "--model", "fast-model"]);
    expect(calls[0].at(-1)).toBe("Session started. [Live: demo]");
    expect(calls[1].slice(0, 3)).toEqual(["exec", "--model", "fast-model"]);
    expect(calls[1]).toContain("resume");
    expect(calls[1]).toContain("session-1");
    expect(calls[1].at(-1)).toBe("Next turn. [Live: demo]");
  });
});
