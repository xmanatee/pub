/**
 * Simple `{{name}}` substitution. Missing keys substitute to "".
 * Values are stringified with String(). For complex bodies, use a handler.
 */
const TOKEN = /\{\{\s*([a-zA-Z_$][a-zA-Z0-9_$.]*)\s*\}\}/g;

export function fillString(input: string, params: Record<string, unknown>): string {
  return input.replace(TOKEN, (_, key: string) => {
    const value = readPath(params, key);
    return value === undefined || value === null ? "" : String(value);
  });
}

export function fillArgs(args: string[] | undefined, params: Record<string, unknown>): string[] {
  if (!args) return [];
  return args.map((arg) => fillString(arg, params));
}

function readPath(obj: Record<string, unknown>, path: string): unknown {
  let cursor: unknown = obj;
  for (const segment of path.split(".")) {
    if (cursor && typeof cursor === "object" && segment in (cursor as Record<string, unknown>)) {
      cursor = (cursor as Record<string, unknown>)[segment];
    } else {
      return undefined;
    }
  }
  return cursor;
}
