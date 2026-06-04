import { readRecordValue, readString } from "~/core/json-boundary";

export interface ComposeEventDraft {
  summary: string;
  description: string;
  startDate: string;
  endDate: string;
  location: string;
}

export function parseComposeEventDraft(value: unknown): ComposeEventDraft {
  const path = "ai.compose-event";
  const record = readRecordValue(value, path);
  return {
    summary: readString(record, "summary", path),
    description: readString(record, "description", path),
    startDate: readString(record, "startDate", path),
    endDate: readString(record, "endDate", path),
    location: readString(record, "location", path),
  };
}
