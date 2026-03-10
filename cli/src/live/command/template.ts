import type { CommandReturnType } from "../../../../shared/command-protocol-core";

function readArgPath(args: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let value: unknown = args;
  for (const part of parts) {
    if (!value || typeof value !== "object") return undefined;
    value = (value as Record<string, unknown>)[part];
  }
  return value;
}

export function interpolateTemplate(input: string, args: Record<string, unknown>): string {
  return input.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_match, path: string) => {
    const value = readArgPath(args, path);
    if (value === undefined || value === null) return "";
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    return JSON.stringify(value);
  });
}

export function toCommandReturnValue(output: string, returnType: CommandReturnType): unknown {
  if (returnType === "void") return null;
  if (returnType === "json") {
    const trimmed = output.trim();
    if (trimmed.length === 0) return {};
    return JSON.parse(trimmed) as unknown;
  }
  return output;
}
