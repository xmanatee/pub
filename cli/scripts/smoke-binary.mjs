import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

assert(process.argv[2], "Pass the native CLI binary to smoke test");
const binary = resolve(process.argv[2]);
const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const environment = { ...process.env, PUB_SKIP_UPDATE_CHECK: "1" };
delete environment.PUB_DAEMON_MODE;
delete environment.PUB_DAEMON_BRIDGE_SETTINGS;

function run(args, env = environment, expectedStatus = 0) {
  const result = spawnSync(binary, args, { env, encoding: "utf8", timeout: 30_000 });
  if (result.error) throw result.error;
  assert.equal(result.status, expectedStatus, `CLI ${args.join(" ")} failed: ${result.stderr}`);
  return result;
}

assert.equal(run(["--version"]).stdout.trim(), version);
run(["--help"]);
const daemon = run([], { ...environment, PUB_DAEMON_MODE: "1" }, 1);
assert.doesNotMatch(
  daemon.stdout + daemon.stderr,
  /require.*polyfill|cannot find|module not found|not resolve/i,
);
assert.match(daemon.stderr, /Missing PUB_DAEMON_BRIDGE_SETTINGS/);
console.log(`CLI ${version}: version, help and daemon startup passed.`);
