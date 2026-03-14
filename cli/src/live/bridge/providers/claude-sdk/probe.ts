import * as os from "node:os";
import type { PubBridgeConfig, BridgeSettings, ClaudeBridgeSettings } from "../../../../core/config/index.js";
import { runAgentWritePongProbe } from "../../../runtime/bridge-write-probe.js";
import {
  buildSdkSessionOptions,
  resolveAutoDetectClaudeSdkCwd,
} from "./discovery.js";
import {
  buildSdkSessionOptionsFromSettings,
  loadClaudeSdk,
} from "./runtime.js";

function getStrictClaudeSdkCwd(bridgeConfig: ClaudeBridgeSettings): string {
  return bridgeConfig.bridgeCwd;
}

function createProbeAbortError(): Error {
  return new Error("Claude SDK ping/pong preflight aborted.");
}

async function nextQueryResult<T>(
  iterator: AsyncIterator<T>,
  signal: AbortSignal,
): Promise<IteratorResult<T>> {
  if (signal.aborted) {
    throw createProbeAbortError();
  }

  let abortHandler: (() => void) | null = null;

  try {
    return await Promise.race([
      iterator.next(),
      new Promise<never>((_, reject) => {
        abortHandler = () => reject(createProbeAbortError());
        signal.addEventListener("abort", abortHandler, { once: true });
      }),
    ]);
  } finally {
    if (abortHandler) {
      signal.removeEventListener("abort", abortHandler);
    }
  }
}

export async function runClaudeSdkBridgeStartupProbe(
  env: NodeJS.ProcessEnv = process.env,
  bridgeConfig?: PubBridgeConfig | BridgeSettings,
  options?: { strictConfig: boolean },
): Promise<{ claudePath: string; cwd?: string }> {
  const strictConfig = options?.strictConfig === true;
  const sessionOptions =
    strictConfig && bridgeConfig
      ? buildSdkSessionOptionsFromSettings(bridgeConfig as ClaudeBridgeSettings, env)
      : buildSdkSessionOptions(env, bridgeConfig);
  const { model, claudePath } = sessionOptions;
  const cwd =
    strictConfig && bridgeConfig
      ? getStrictClaudeSdkCwd(bridgeConfig as ClaudeBridgeSettings)
      : resolveAutoDetectClaudeSdkCwd(env, bridgeConfig);

  const sdk = loadClaudeSdk();

  await runAgentWritePongProbe({
    label: "Claude SDK",
    timeoutMs: 60_000,
    baseEnv: env,
    execute: async (probeEnv, signal) => {
      const probeEnvClean: Record<string, string | undefined> = { ...probeEnv };
      delete probeEnvClean.CLAUDECODE;

      const socketPath = probeEnv.PUB_AGENT_SOCKET ?? "";
      const prompt = [
        "This is a startup connectivity probe.",
        "Run this exact shell command now:",
        `PUB_AGENT_SOCKET=${socketPath} pub write \"pong\"`,
        "Do not explain. Just execute it.",
      ].join("\n");

      const query = sdk.query({
        prompt,
        options: {
          model,
          pathToClaudeCodeExecutable: claudePath,
          env: probeEnvClean,
          cwd: cwd || os.tmpdir(),
          maxTurns: 2,
          persistSession: false,
          canUseTool: async (_toolName, input) => {
            return { behavior: "allow" as const, updatedInput: input };
          },
        },
      });

      const iterator = query[Symbol.asyncIterator]();
      try {
        while (true) {
          const next = await nextQueryResult(iterator, signal);
          if (next.done) break;
        }
      } finally {
        if (signal.aborted && typeof iterator.return === "function") {
          await iterator.return();
        }
      }
    },
  });

  return { claudePath, cwd };
}
