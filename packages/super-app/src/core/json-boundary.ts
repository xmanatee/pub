export type JsonRecord = Record<string, unknown>;

export function readRecordValue(value: unknown, path: string): JsonRecord {
  if (typeof value === "object" && value !== null && !Array.isArray(value))
    return value as JsonRecord;
  throw new Error(`${path} must be an object`);
}

export function readArrayValue(value: unknown, path: string): unknown[] {
  if (Array.isArray(value)) return value;
  throw new Error(`${path} must be an array`);
}

export function readStringValue(value: unknown, path: string): string {
  if (typeof value === "string") return value;
  throw new Error(`${path} must be a string`);
}

export function readArray(record: JsonRecord, key: string, path: string): unknown[] {
  return readArrayValue(record[key], `${path}.${key}`);
}

export function readString(record: JsonRecord, key: string, path: string): string {
  return readStringValue(record[key], `${path}.${key}`);
}

export function readNullableString(record: JsonRecord, key: string, path: string): string | null {
  const value = record[key];
  if (typeof value === "string" || value === null) return value;
  throw new Error(`${path}.${key} must be a string or null`);
}

export function readOptionalNullableString(
  record: JsonRecord,
  key: string,
  path: string,
): string | null | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value === "string" || value === null) return value;
  throw new Error(`${path}.${key} must be a string or null when present`);
}

export function readOptionalString(
  record: JsonRecord,
  key: string,
  path: string,
): string | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value === "string") return value;
  throw new Error(`${path}.${key} must be a string when present`);
}

export function readNumber(record: JsonRecord, key: string, path: string): number {
  const value = record[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  throw new Error(`${path}.${key} must be a finite number`);
}

export function readOptionalNumber(
  record: JsonRecord,
  key: string,
  path: string,
): number | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  throw new Error(`${path}.${key} must be a finite number when present`);
}

export function readOptionalNullableNumber(
  record: JsonRecord,
  key: string,
  path: string,
): number | null | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  throw new Error(`${path}.${key} must be a finite number or null when present`);
}

export function readNullableNumber(record: JsonRecord, key: string, path: string): number | null {
  const value = record[key];
  if (value === null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  throw new Error(`${path}.${key} must be a finite number or null`);
}

export function readBoolean(record: JsonRecord, key: string, path: string): boolean {
  const value = record[key];
  if (typeof value === "boolean") return value;
  throw new Error(`${path}.${key} must be a boolean`);
}

export function readStringArray(record: JsonRecord, key: string, path: string): string[] {
  return readArray(record, key, path).map((value, index) =>
    readStringValue(value, `${path}.${key}[${index}]`),
  );
}

export function readStringLiteral<const T extends readonly string[]>(
  record: JsonRecord,
  key: string,
  path: string,
  allowed: T,
): T[number] {
  const value = readString(record, key, path);
  if ((allowed as readonly string[]).includes(value)) return value;
  throw new Error(`${path}.${key} must be one of ${allowed.join(", ")}`);
}

export function readOptionalStringLiteral<const T extends readonly string[]>(
  record: JsonRecord,
  key: string,
  path: string,
  allowed: T,
): T[number] | undefined {
  const value = readOptionalString(record, key, path);
  if (value === undefined) return undefined;
  if ((allowed as readonly string[]).includes(value)) return value;
  throw new Error(`${path}.${key} must be one of ${allowed.join(", ")} when present`);
}

export function readOptionalNullableStringLiteral<const T extends readonly string[]>(
  record: JsonRecord,
  key: string,
  path: string,
  allowed: T,
): T[number] | null | undefined {
  const value = readOptionalNullableString(record, key, path);
  if (value === undefined || value === null) return value;
  if ((allowed as readonly string[]).includes(value)) return value;
  throw new Error(`${path}.${key} must be one of ${allowed.join(", ")} or null when present`);
}

export function readNullableStringLiteral<const T extends readonly string[]>(
  record: JsonRecord,
  key: string,
  path: string,
  allowed: T,
): T[number] | null {
  const value = readNullableString(record, key, path);
  if (value === null) return null;
  if ((allowed as readonly string[]).includes(value)) return value;
  throw new Error(`${path}.${key} must be one of ${allowed.join(", ")} or null`);
}
