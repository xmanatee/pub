import { PubApiClient } from "../../core/api/client.js";
import type { ApiClientSettings } from "../../core/config/index.js";
import { getApiClientSettings } from "../../core/config/index.js";
import { errorMessage, failCli } from "../../core/errors/cli-error.js";
import { getAgentSocketPath, ipcCall } from "../../live/transport/ipc.js";
import type {
  IpcRequest,
  IpcResponseFor,
  SuccessfulIpcResponseFor,
} from "../../live/transport/ipc-protocol.js";
import { type ReadFileBytesResult, readFileBytes, readStdinText, readUtf8File } from "./io.js";

export type CliCommandContext = {
  readonly env: NodeJS.ProcessEnv;
  readonly socketPath: string;
  getApiClient(settingsOverride?: ApiClientSettings): PubApiClient;
  callDaemon<T extends IpcRequest["method"]>(
    request: Extract<IpcRequest, { method: T }>,
  ): Promise<IpcResponseFor<T>>;
  requireDaemonResponse<T extends IpcRequest["method"]>(
    request: Extract<IpcRequest, { method: T }>,
    failurePrefix: string,
  ): Promise<SuccessfulIpcResponseFor<T>>;
  resolveActiveSlug(): Promise<string>;
  readStdinText(options?: Parameters<typeof readStdinText>[0]): Promise<string>;
  readUtf8File(filePath: string): string;
  readFileBytes(filePath: string): ReadFileBytesResult;
};

export function createCliCommandContext(env: NodeJS.ProcessEnv = process.env): CliCommandContext {
  const socketPath = getAgentSocketPath(env);
  let apiClient: PubApiClient | null = null;

  function getApiClient(settingsOverride?: ApiClientSettings): PubApiClient {
    if (settingsOverride) {
      return new PubApiClient(settingsOverride.baseUrl, settingsOverride.apiKey);
    }
    if (!apiClient) {
      const settings = getApiClientSettings(env);
      apiClient = new PubApiClient(settings.baseUrl, settings.apiKey);
    }
    return apiClient;
  }

  async function callDaemon<T extends IpcRequest["method"]>(
    request: Extract<IpcRequest, { method: T }>,
  ): Promise<IpcResponseFor<T>> {
    return ipcCall(socketPath, request);
  }

  async function requireDaemonResponse<T extends IpcRequest["method"]>(
    request: Extract<IpcRequest, { method: T }>,
    failurePrefix: string,
  ): Promise<SuccessfulIpcResponseFor<T>> {
    let response: IpcResponseFor<T>;
    try {
      response = await callDaemon(request);
    } catch (error) {
      failCli(`${failurePrefix}: ${errorMessage(error)}`);
    }

    if (!response.ok) {
      failCli(`${failurePrefix}: ${response.error}`);
    }

    return response as SuccessfulIpcResponseFor<T>;
  }

  async function resolveActiveSlug(): Promise<string> {
    const response = await callDaemon({ method: "active-slug", params: {} });
    if (!response.ok) {
      throw new Error(response.error);
    }
    if (!response.slug) {
      throw new Error(
        "Daemon is running but no live is active. Wait for browser to initiate live.",
      );
    }
    return response.slug;
  }

  return {
    env,
    socketPath,
    getApiClient,
    callDaemon,
    requireDaemonResponse,
    resolveActiveSlug,
    readStdinText,
    readUtf8File,
    readFileBytes,
  };
}
