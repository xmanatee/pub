import { readFromStdin } from "../shared/index.js";

export function resolveConfigureApiKey(opts: {
  apiKey?: string;
  apiKeyStdin?: boolean;
}): Promise<string> {
  if (opts.apiKey && opts.apiKeyStdin) {
    throw new Error("Use only one of --api-key or --api-key-stdin.");
  }
  if (opts.apiKey) {
    return Promise.resolve(opts.apiKey.trim());
  }
  if (opts.apiKeyStdin) {
    return readFromStdin();
  }
  throw new Error("No API key provided. Use --api-key <KEY> or --api-key-stdin.");
}

export function collectValues(value: string, previous: string[]): string[] {
  previous.push(value);
  return previous;
}
