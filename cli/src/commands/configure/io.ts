import { readFromStdin } from "../shared.js";

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

  const envKey = process.env.PUB_API_KEY?.trim();
  if (envKey) return Promise.resolve(envKey);

  throw new Error(
    "No API key provided. Use --api-key <KEY>, --api-key-stdin, or set PUB_API_KEY.",
  );
}

export function collectValues(value: string, previous: string[]): string[] {
  previous.push(value);
  return previous;
}
