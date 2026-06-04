import { readRecordValue, readString } from "~/core/json-boundary";

export function parseCategoryResult(value: unknown, categories: string[]): string {
  const path = "ai.categorize";
  const record = readRecordValue(value, path);
  const category = readString(record, "category", path);
  if (categories.includes(category)) return category;
  throw new Error(`${path}.category must be one of ${categories.join(", ")}`);
}
