import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildOpenClawLikeCommandEnv,
  DEFAULT_OPENCLAW_LIKE_DELIVERY_TIMEOUT_MS,
  deliverMessageToCommand,
} from "./runtime.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pub-openclaw-like-"));
  tempDirs.push(dir);
  return dir;
}

describe("buildOpenClawLikeCommandEnv", () => {
  it("maps the daemon socket to the client socket and strips daemon-only env", () => {
    const env: NodeJS.ProcessEnv = {
      PATH: "/bin",
      PUB_DAEMON_MODE: "1",
      PUB_DAEMON_SOCKET: "/tmp/daemon.sock",
      PUB_DAEMON_API_KEY: "secret",
      PUB_DAEMON_BRIDGE_SETTINGS: "{}",
      PUB_DAEMON_CUSTOM_INTERNAL: "future",
    };

    const commandEnv = buildOpenClawLikeCommandEnv(env);

    expect(commandEnv.PATH).toBe("/bin");
    expect(commandEnv.PUB_AGENT_SOCKET).toBe("/tmp/daemon.sock");
    expect(commandEnv.PUB_DAEMON_MODE).toBeUndefined();
    expect(commandEnv.PUB_DAEMON_SOCKET).toBeUndefined();
    expect(commandEnv.PUB_DAEMON_API_KEY).toBeUndefined();
    expect(commandEnv.PUB_DAEMON_BRIDGE_SETTINGS).toBeUndefined();
    expect(commandEnv.PUB_DAEMON_CUSTOM_INTERNAL).toBeUndefined();
    expect(commandEnv.PUB_SKIP_UPDATE_CHECK).toBe("1");
    expect(env.PUB_DAEMON_MODE).toBe("1");
  });

  it("keeps an explicit client socket when one is already present", () => {
    const commandEnv = buildOpenClawLikeCommandEnv({
      PUB_AGENT_SOCKET: "/tmp/client.sock",
      PUB_DAEMON_SOCKET: "/tmp/daemon.sock",
    });

    expect(commandEnv.PUB_AGENT_SOCKET).toBe("/tmp/client.sock");
    expect(commandEnv.PUB_DAEMON_SOCKET).toBeUndefined();
  });
});

describe("deliverMessageToCommand", () => {
  it("allows long-running conversational agent work by default", () => {
    expect(DEFAULT_OPENCLAW_LIKE_DELIVERY_TIMEOUT_MS).toBeGreaterThanOrEqual(5 * 60 * 1000);
  });

  it("executes bridge commands with client-safe env from daemon mode", async () => {
    const dir = makeTempDir();
    const command = path.join(dir, "capture-env.mjs");
    const outputPath = path.join(dir, "env.json");
    fs.writeFileSync(
      command,
      `#!/usr/bin/env node
import * as fs from "node:fs";

const keys = [
  "PUB_AGENT_SOCKET",
  "PUB_DAEMON_MODE",
  "PUB_DAEMON_SOCKET",
  "PUB_DAEMON_API_KEY",
  "PUB_DAEMON_CUSTOM_INTERNAL",
  "PUB_SKIP_UPDATE_CHECK",
];
const env = {};
for (const key of keys) {
  env[key] = Object.prototype.hasOwnProperty.call(process.env, key) ? process.env[key] : null;
}
fs.writeFileSync(process.env.PUB_ENV_OUTPUT, JSON.stringify({
  cwd: process.cwd(),
  prompt: process.argv[2] ?? "",
  env,
}));
process.stdout.write("ok\\n");
`,
      { mode: 0o755 },
    );

    const reply = await deliverMessageToCommand(
      { command, text: "show me solar system" },
      {
        PATH: process.env.PATH,
        PUB_ENV_OUTPUT: outputPath,
        PUB_DAEMON_MODE: "1",
        PUB_DAEMON_SOCKET: "/tmp/daemon.sock",
        PUB_DAEMON_API_KEY: "secret",
        PUB_DAEMON_CUSTOM_INTERNAL: "future",
      },
      { workspaceDir: dir },
    );

    expect(reply).toBe("ok");
    const captured = JSON.parse(fs.readFileSync(outputPath, "utf-8")) as {
      cwd: string;
      prompt: string;
      env: Record<string, string | null>;
    };
    expect(fs.realpathSync(captured.cwd)).toBe(fs.realpathSync(dir));
    expect(captured.prompt).toBe("show me solar system");
    expect(captured.env.PUB_AGENT_SOCKET).toBe("/tmp/daemon.sock");
    expect(captured.env.PUB_DAEMON_MODE).toBeNull();
    expect(captured.env.PUB_DAEMON_SOCKET).toBeNull();
    expect(captured.env.PUB_DAEMON_API_KEY).toBeNull();
    expect(captured.env.PUB_DAEMON_CUSTOM_INTERNAL).toBeNull();
    expect(captured.env.PUB_SKIP_UPDATE_CHECK).toBe("1");
  });
});
