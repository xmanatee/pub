import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { SYSTEM_FILES } from "../../../../shared/pub-system-files-core";

export const FROZEN_FILES: Record<string, string> = Object.fromEntries(
  Object.entries(SYSTEM_FILES).map(([path, file]) => [path, file.content]),
);

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

const FROZEN_HASHES: Record<string, string> = Object.fromEntries(
  Object.entries(FROZEN_FILES).map(([path, content]) => [path, sha256(content)]),
);

export function validateFrozenFiles(dir: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const [relPath, expectedHash] of Object.entries(FROZEN_HASHES)) {
    const fullPath = join(dir, relPath);
    if (!existsSync(fullPath)) continue;

    const actual = readFileSync(fullPath, "utf-8");
    const actualHash = sha256(actual);

    if (actualHash !== expectedHash) {
      errors.push(`Frozen file modified: ${relPath}`);
    }
  }

  return { valid: errors.length === 0, errors };
}
