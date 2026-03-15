import { spawn } from "node:child_process";
import type {
  CommandAgentProfile,
  CommandAgentProvider,
  CommandAgentSpec,
} from "../../../../../shared/command-protocol-core.js";
import type { BridgeSettings, ClaudeBridgeSettings } from "../../../core/config/index.js";
import type { BridgeRunner } from "../shared.js";
import { buildClaudeArgsFromSettings } from "./claude-code/index.js";
import { buildSdkSessionOptionsFromSettings } from "./claude-sdk/index.js";
import { loadClaudeSdk } from "./claude-sdk/runtime.js";

type AgentCommandProvider = Exclude<CommandAgentProvider, "auto">;
type DetachedAgentProvider = AgentCommandProvider;

function readClaudeAssistantOutput(line: string): string | null {
  if (!line.trim().startsWith("{")) return "";
  try {
    const event = JSON.parse(line) as {
      delta?: { text?: unknown };
      message?: { content?: unknown; role?: unknown };
      text?: unknown;
      type?: unknown;
    };
    if (typeof event.text === "string") return event.text;
    if (event.delta && typeof event.delta.text === "string") return event.delta.text;
    if (
      event.message &&
      event.message.role === "assistant" &&
      typeof event.message.content === "string"
    ) {
      return event.message.content;
    }
    return "";
  } catch {
    return null;
  }
}

function readClaudeSdkAssistantOutput(message: unknown): string {
  if (!message || typeof message !== "object") return "";
  const event = message as {
    text?: unknown;
    message?: unknown;
    delta?: { text?: unknown } | null;
    content?: unknown;
  };
  if (typeof event.text === "string") return event.text;
  if (event.delta && typeof event.delta.text === "string") return event.delta.text;
  if (typeof event.message === "string") return event.message;
  if (Array.isArray(event.content)) {
    return event.content
      .map((entry) =>
        entry && typeof entry === "object" && "text" in entry && typeof entry.text === "string"
          ? entry.text
          : "",
      )
      .join("");
  }
  return "";
}

function parseAgentOutput(outputText: string, output: "text" | "json"): unknown {
  if (output === "json") {
    const trimmed = outputText.trim();
    if (trimmed.length === 0) return {};
    return JSON.parse(trimmed) as unknown;
  }
  return outputText;
}

function toSdkToolInput(input: unknown): Record<string, unknown> | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
  return input as Record<string, unknown>;
}

function getClaudeCommandRuntime(bridgeSettings: BridgeSettings): {
  bridgeCwd: string;
  claudeCodeMaxTurns?: number;
  claudePath: string;
  commandModelDefault?: string;
  commandModelFast?: string;
  commandModelDeep?: string;
} {
  const claudePath = bridgeSettings.claudeCodePath?.trim();
  if (!claudePath) {
    throw new Error(
      "Claude runtime is not configured for canvas agent commands. Set `claude-code.path` or `CLAUDE_CODE_PATH`.",
    );
  }

  return {
    claudePath,
    bridgeCwd: bridgeSettings.bridgeCwd,
    claudeCodeMaxTurns: bridgeSettings.claudeCodeMaxTurns,
    commandModelDefault: bridgeSettings.claudeCodeCommandModelDefault,
    commandModelFast: bridgeSettings.claudeCodeCommandModelFast,
    commandModelDeep: bridgeSettings.claudeCodeCommandModelDeep,
  };
}

function getClaudeSdkCommandRuntime(bridgeSettings: BridgeSettings): ClaudeBridgeSettings {
  if (bridgeSettings.mode === "claude-code" || bridgeSettings.mode === "claude-sdk") {
    if (bridgeSettings.claudeCodePath?.trim()) return bridgeSettings;
  }
  const claudePath = bridgeSettings.claudeCodePath?.trim();
  if (!claudePath) {
    throw new Error(
      "Claude SDK runtime is not configured for canvas agent commands. Set `claude-code.path` or `CLAUDE_CODE_PATH`.",
    );
  }

  return {
    ...bridgeSettings,
    mode: "claude-sdk",
    claudeCodePath: claudePath,
  };
}

function hasClaudeCommandRuntime(bridgeSettings: BridgeSettings): boolean {
  return Boolean(bridgeSettings.claudeCodePath?.trim());
}

function hasClaudeSdkCommandRuntime(bridgeSettings: BridgeSettings): boolean {
  return Boolean(bridgeSettings.claudeCodePath?.trim());
}

function hasOpenClawCommandRuntime(bridgeSettings: BridgeSettings): boolean {
  return Boolean(bridgeSettings.openclawPath?.trim() && bridgeSettings.sessionId?.trim());
}

export function resolveMainAgentCommandProvider(params: {
  bridgeSettings: BridgeSettings;
  provider?: CommandAgentProvider;
}): AgentCommandProvider {
  const requested = params.provider;
  const activeMode = params.bridgeSettings.mode;

  if (activeMode === "openclaw-like") {
    throw new Error("AGENT_MAIN_UNSUPPORTED: active bridge does not support main-session commands.");
  }

  const activeProvider = activeMode as AgentCommandProvider;
  if (!requested || requested === "auto") return activeProvider;
  if (requested !== activeProvider) {
    throw new Error(
      `AGENT_MAIN_PROVIDER_MISMATCH: active bridge is "${activeProvider}", but command requested "${requested}".`,
    );
  }
  return activeProvider;
}

function resolveDetachedAgentCommandProvider(params: {
  bridgeSettings: BridgeSettings;
  provider?: CommandAgentProvider;
}): DetachedAgentProvider {
  const requested = params.provider;
  if (requested === "claude-code") {
    getClaudeCommandRuntime(params.bridgeSettings);
    return "claude-code";
  }
  if (requested === "claude-sdk") {
    getClaudeSdkCommandRuntime(params.bridgeSettings);
    return "claude-sdk";
  }
  if (requested === "openclaw") {
    throw new Error(
      "AGENT_DETACHED_UNSUPPORTED: detached OpenClaw agent commands are not supported.",
    );
  }

  const configured = params.bridgeSettings.commandAgentDetachedProvider;
  if (configured === "claude-sdk" && hasClaudeSdkCommandRuntime(params.bridgeSettings)) {
    return "claude-sdk";
  }
  if (configured === "claude-code" && hasClaudeCommandRuntime(params.bridgeSettings)) {
    return "claude-code";
  }
  if (configured === "openclaw") {
    throw new Error(
      "AGENT_DETACHED_UNSUPPORTED: detached OpenClaw agent commands are not supported.",
    );
  }

  if (
    params.bridgeSettings.mode === "claude-sdk" &&
    hasClaudeSdkCommandRuntime(params.bridgeSettings)
  ) {
    return "claude-sdk";
  }
  if (
    params.bridgeSettings.mode === "claude-code" &&
    hasClaudeCommandRuntime(params.bridgeSettings)
  ) {
    return "claude-code";
  }
  if (hasClaudeSdkCommandRuntime(params.bridgeSettings)) return "claude-sdk";
  if (hasClaudeCommandRuntime(params.bridgeSettings)) return "claude-code";
  if (hasOpenClawCommandRuntime(params.bridgeSettings)) {
    throw new Error(
      "AGENT_DETACHED_UNSUPPORTED: only Claude providers currently support detached agent commands.",
    );
  }

  throw new Error(
    "AGENT_PROVIDER_UNAVAILABLE: no local agent runtime is configured for detached canvas agent commands.",
  );
}

function resolveDetachedProfile(
  bridgeSettings: BridgeSettings,
  profile?: CommandAgentProfile,
): CommandAgentProfile {
  return profile ?? bridgeSettings.commandAgentDefaultProfile ?? "default";
}

export function resolveDetachedAgentModel(params: {
  bridgeSettings: BridgeSettings;
  provider: DetachedAgentProvider;
  profile?: CommandAgentProfile;
  model?: string;
}): string | undefined {
  const explicitModel = params.model?.trim();
  if (explicitModel) return explicitModel;

  const profile = resolveDetachedProfile(params.bridgeSettings, params.profile);
  if (params.provider === "claude-code") {
    if (profile === "fast") return params.bridgeSettings.claudeCodeCommandModelFast?.trim();
    if (profile === "deep") return params.bridgeSettings.claudeCodeCommandModelDeep?.trim();
    return params.bridgeSettings.claudeCodeCommandModelDefault?.trim();
  }
  if (profile === "fast") return params.bridgeSettings.claudeSdkCommandModelFast?.trim();
  if (profile === "deep") return params.bridgeSettings.claudeSdkCommandModelDeep?.trim();
  return params.bridgeSettings.claudeSdkCommandModelDefault?.trim();
}

export function validateMainModeAgentSpec(spec: CommandAgentSpec): void {
  if (spec.profile) {
    throw new Error(
      `AGENT_MODEL_OVERRIDE_INVALID: main-session agent commands cannot use profile "${spec.profile}".`,
    );
  }
  if (spec.model?.trim()) {
    throw new Error(
      "AGENT_MODEL_OVERRIDE_INVALID: main-session agent commands cannot override the model.",
    );
  }
}

async function executeDetachedClaudeAgentCommand(params: {
  prompt: string;
  timeoutMs: number;
  output: "text" | "json";
  maxOutputBytes: number;
  signal: AbortSignal;
  bridgeSettings: BridgeSettings;
  model?: string;
}): Promise<unknown> {
  const runtime = getClaudeCommandRuntime(params.bridgeSettings);
  const args = buildClaudeArgsFromSettings(params.prompt, null, null, runtime, {
    model: params.model,
  });
  if (!args.includes("--max-turns")) {
    args.push("--max-turns", "4");
  }

  const outputText = await new Promise<string>((resolve, reject) => {
    const child = spawn(runtime.claudePath, args, {
      cwd: runtime.bridgeCwd,
      env: { ...process.env },
      signal: params.signal,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      fn();
    };
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      finish(() => reject(new Error(`Agent command timed out after ${params.timeoutMs}ms`)));
    }, params.timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf-8");
      if (stdout.length > params.maxOutputBytes) {
        child.kill("SIGTERM");
        finish(() => reject(new Error(`stdout exceeded ${params.maxOutputBytes} bytes`)));
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf-8");
      if (stderr.length > params.maxOutputBytes) {
        child.kill("SIGTERM");
        finish(() => reject(new Error(`stderr exceeded ${params.maxOutputBytes} bytes`)));
      }
    });
    child.on("error", (error) => {
      finish(() => reject(error));
    });
    child.on("close", (code) => {
      if (code !== 0) {
        const detail = stderr.trim().length > 0 ? stderr.trim() : `exit code ${code}`;
        finish(() => reject(new Error(detail)));
        return;
      }
      const lines = stdout.split(/\r?\n/);
      let sawMalformedStructuredOutput = false;
      const chunks = lines.flatMap((line) => {
        const extracted = readClaudeAssistantOutput(line);
        if (extracted === null) {
          sawMalformedStructuredOutput = true;
          return [];
        }
        return extracted.length > 0 ? [extracted] : [];
      });
      const joined = chunks.join("").trim();
      finish(() =>
        resolve(sawMalformedStructuredOutput || joined.length === 0 ? stdout.trim() : joined),
      );
    });
  });

  return parseAgentOutput(outputText, params.output);
}

async function executeDetachedClaudeSdkAgentCommand(params: {
  prompt: string;
  timeoutMs: number;
  output: "text" | "json";
  maxOutputBytes: number;
  signal: AbortSignal;
  bridgeSettings: BridgeSettings;
  model?: string;
}): Promise<unknown> {
  const bridgeSettings = getClaudeSdkCommandRuntime(params.bridgeSettings);
  const loadedSdk = loadClaudeSdk();
  const { model, claudePath, sdkEnv } = buildSdkSessionOptionsFromSettings(
    bridgeSettings,
    process.env,
    { model: params.model },
  );

  type SdkSession = ReturnType<typeof loadedSdk.unstable_v2_createSession>;

  const session: SdkSession = loadedSdk.unstable_v2_createSession({
    model,
    pathToClaudeCodeExecutable: claudePath,
    env: sdkEnv,
    canUseTool: async (_tool: unknown, input: unknown) => ({
      behavior: "allow" as const,
      updatedInput: toSdkToolInput(input),
    }),
  });

  const outputText = await new Promise<string>((resolve, reject) => {
    let settled = false;
    let collected = "";
    const finish = (result: { ok: true; value: string } | { ok: false; error: unknown }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      params.signal.removeEventListener("abort", onAbort);
      try {
        session.close();
      } catch (closeError) {
        if (!result.ok) {
          reject(
            new AggregateError(
              [result.error, closeError],
              "Detached Claude SDK agent command failed and session cleanup also failed.",
            ),
          );
          return;
        }
        reject(closeError);
        return;
      }
      if (result.ok) {
        resolve(result.value);
        return;
      }
      reject(result.error);
    };
    const onAbort = () => {
      finish({ ok: false, error: new Error("Agent command was aborted.") });
    };
    params.signal.addEventListener("abort", onAbort, { once: true });
    const timeout = setTimeout(() => {
      finish({
        ok: false,
        error: new Error(`Agent command timed out after ${params.timeoutMs}ms`),
      });
    }, params.timeoutMs);

    void (async () => {
      try {
        await session.send(params.prompt);
        for await (const message of session.stream()) {
          const text = readClaudeSdkAssistantOutput(message);
          if (text.length > 0) {
            collected += text;
            if (collected.length > params.maxOutputBytes) {
              throw new Error(`stdout exceeded ${params.maxOutputBytes} bytes`);
            }
          }
          if (
            message &&
            typeof message === "object" &&
            "type" in message &&
            message.type === "result"
          ) {
            const result = message as { subtype?: unknown };
            if (result.subtype && result.subtype !== "success") {
              throw new Error(`Claude SDK result error: ${String(result.subtype)}`);
            }
          }
        }
        finish({ ok: true, value: collected.trim() });
      } catch (error) {
        finish({ ok: false, error });
      }
    })();
  });

  return parseAgentOutput(outputText, params.output);
}

export function resolveDetachedAgentCommand(params: {
  bridgeSettings: BridgeSettings;
  spec: CommandAgentSpec;
}): {
  provider: DetachedAgentProvider;
  model?: string;
  profile: CommandAgentProfile;
} {
  const provider = resolveDetachedAgentCommandProvider({
    bridgeSettings: params.bridgeSettings,
    provider: params.spec.provider,
  });
  const profile = resolveDetachedProfile(params.bridgeSettings, params.spec.profile);
  const model = resolveDetachedAgentModel({
    bridgeSettings: params.bridgeSettings,
    provider,
    profile,
    model: params.spec.model,
  });

  return {
    provider,
    model,
    profile,
  };
}

export async function executeAgentCommand(params: {
  prompt: string;
  timeoutMs: number;
  output: "text" | "json";
  maxOutputBytes: number;
  signal: AbortSignal;
  bridgeSettings: BridgeSettings;
  spec: CommandAgentSpec;
  getBridgeRunner?: () => BridgeRunner | null;
}): Promise<unknown> {
  if (params.spec.mode === "main") {
    validateMainModeAgentSpec(params.spec);
    const provider = resolveMainAgentCommandProvider({
      bridgeSettings: params.bridgeSettings,
      provider: params.spec.provider,
    });
    const runner = params.getBridgeRunner?.() ?? null;
    if (!runner?.invokeAgentCommand) {
      throw new Error(
        `AGENT_MAIN_UNSUPPORTED: bridge runner for "${provider}" does not support main-session agent commands.`,
      );
    }
    const runnerAbort = new AbortController();
    const onAbort = () => runnerAbort.abort();
    params.signal.addEventListener("abort", onAbort, { once: true });
    const timeout = setTimeout(() => runnerAbort.abort(), params.timeoutMs);
    try {
      return await runner.invokeAgentCommand({
        prompt: params.prompt,
        timeoutMs: params.timeoutMs,
        output: params.output,
        signal: runnerAbort.signal,
      });
    } finally {
      clearTimeout(timeout);
      params.signal.removeEventListener("abort", onAbort);
    }
  }

  const detached = resolveDetachedAgentCommand({
    bridgeSettings: params.bridgeSettings,
    spec: params.spec,
  });

  if (detached.provider === "claude-sdk") {
    return await executeDetachedClaudeSdkAgentCommand({
      prompt: params.prompt,
      timeoutMs: params.timeoutMs,
      output: params.output,
      maxOutputBytes: params.maxOutputBytes,
      signal: params.signal,
      bridgeSettings: params.bridgeSettings,
      model: detached.model,
    });
  }

  return await executeDetachedClaudeAgentCommand({
    prompt: params.prompt,
    timeoutMs: params.timeoutMs,
    output: params.output,
    maxOutputBytes: params.maxOutputBytes,
    signal: params.signal,
    bridgeSettings: params.bridgeSettings,
    model: detached.model,
  });
}
