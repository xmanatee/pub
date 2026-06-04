import { readRecordValue, readString } from "~/core/json-boundary";

export interface ComposeEmailDraft {
  to: string;
  subject: string;
  body: string;
}

export function parseComposeEmailDraft(value: unknown): ComposeEmailDraft {
  const path = "ai.compose-email";
  const record = readRecordValue(value, path);
  return {
    to: readString(record, "to", path),
    subject: readString(record, "subject", path),
    body: readString(record, "body", path),
  };
}
