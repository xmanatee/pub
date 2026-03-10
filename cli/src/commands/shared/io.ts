import * as fs from "node:fs";
import * as path from "node:path";
import { failCli } from "../../core/errors/cli-error.js";

export async function readFromStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf-8").trim();
}

export function readFile(filePath: string): string {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    failCli(`File not found: ${resolved}`);
  }
  return fs.readFileSync(resolved, "utf-8");
}
