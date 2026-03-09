export function readRecord(input: unknown): Record<string, unknown> | null {
  return input && typeof input === "object" && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : null;
}

export function readString(input: unknown): string | undefined {
  return typeof input === "string" ? input : undefined;
}

export function readNonEmptyString(input: unknown): string | undefined {
  return typeof input === "string" && input.trim().length > 0 ? input : undefined;
}

export function readTrimmedString(input: unknown): string | undefined {
  if (typeof input !== "string") return undefined;
  const value = input.trim();
  return value.length > 0 ? value : undefined;
}

export function readFiniteNumber(input: unknown): number | undefined {
  return typeof input === "number" && Number.isFinite(input) ? input : undefined;
}

export function readBoolean(input: unknown): boolean | undefined {
  return typeof input === "boolean" ? input : undefined;
}

export function readStringArray(input: unknown): string[] | undefined {
  if (!Array.isArray(input)) return undefined;
  const values = input.filter((entry): entry is string => typeof entry === "string");
  return values.length === input.length ? values : undefined;
}

export function readStringRecord(input: unknown): Record<string, string> | undefined {
  const record = readRecord(input);
  if (!record) return undefined;
  const entries = Object.entries(record);
  const values = entries.filter((entry): entry is [string, string] => typeof entry[1] === "string");
  if (values.length !== entries.length) return undefined;
  return Object.fromEntries(values);
}
