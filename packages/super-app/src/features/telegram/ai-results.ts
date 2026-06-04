import {
  readArray,
  readOptionalString,
  readRecordValue,
  readString,
  readStringLiteral,
} from "~/core/json-boundary";

const DIGEST_PRIORITIES = ["needs-response", "worth-reading", "low"] as const;

export interface DigestThreadItem {
  id?: string;
  priority: (typeof DIGEST_PRIORITIES)[number];
  reason: string;
}

export interface DigestThreadsResult {
  items: DigestThreadItem[];
}

function parseDigestThreadItem(value: unknown, path: string): DigestThreadItem {
  const record = readRecordValue(value, path);
  return {
    id: readOptionalString(record, "id", path),
    priority: readStringLiteral(record, "priority", path, DIGEST_PRIORITIES),
    reason: readString(record, "reason", path),
  };
}

export function parseDigestThreadsResult(value: unknown): DigestThreadsResult {
  const path = "ai.digest-threads";
  const record = readRecordValue(value, path);
  return {
    items: readArray(record, "items", path).map((item, index) =>
      parseDigestThreadItem(item, `${path}.items[${index}]`),
    ),
  };
}
