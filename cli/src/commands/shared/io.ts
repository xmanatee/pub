import * as fs from "node:fs";
import * as path from "node:path";
import { failCli } from "../../core/errors/cli-error.js";

interface ReadStdinTextOptions {
  missingMessage?: string;
  trim?: boolean;
}

export type ReadFileBytesResult = {
  bytes: Buffer;
  resolvedPath: string;
};

function hasErrnoCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === code
  );
}

export async function readStdinText(options: ReadStdinTextOptions = {}): Promise<string> {
  if (process.stdin.isTTY) {
    failCli(options.missingMessage ?? "Expected piped stdin input.");
  }

  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }

  const text = Buffer.concat(chunks).toString("utf-8");
  return options.trim ? text.trim() : text;
}

export function readFileBytes(filePath: string): ReadFileBytesResult {
  const resolvedPath = path.resolve(filePath);

  try {
    return {
      bytes: fs.readFileSync(resolvedPath),
      resolvedPath,
    };
  } catch (error) {
    if (hasErrnoCode(error, "ENOENT")) {
      failCli(`File not found: ${resolvedPath}`);
    }
    throw error;
  }
}

export function readUtf8File(filePath: string): string {
  return readFileBytes(filePath).bytes.toString("utf-8");
}
