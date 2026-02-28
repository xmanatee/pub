import * as fs from "node:fs";
import * as path from "node:path";
import { PubApiClient } from "../lib/api.js";
import { failCli } from "../lib/cli-error.js";
import { getConfig } from "../lib/config.js";

export function createClient(): PubApiClient {
  const config = getConfig();
  return new PubApiClient(config.baseUrl, config.apiKey);
}

export async function readFromStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf-8").trim();
}

export function formatVisibility(isPublic: boolean): string {
  return isPublic ? "public" : "private";
}

export function resolveVisibilityFlags(opts: {
  public?: boolean;
  private?: boolean;
  commandName: string;
}): boolean | undefined {
  if (opts.public && opts.private) {
    throw new Error(`Use only one of --public or --private for ${opts.commandName}.`);
  }
  if (opts.public) return true;
  if (opts.private) return false;
  return undefined;
}

export function readFile(filePath: string): { content: string; basename: string } {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    failCli(`File not found: ${resolved}`);
  }
  return {
    content: fs.readFileSync(resolved, "utf-8"),
    basename: path.basename(resolved),
  };
}
