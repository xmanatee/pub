import { readNonEmptyString, readRecord, readString } from "./protocol-runtime-core";

export const PREVIEW_SNAPSHOT_SOURCE = "pub-preview";

export interface PreviewSnapshotMessage {
  source: typeof PREVIEW_SNAPSHOT_SOURCE;
  type: "snapshot";
  html: string;
}

export function parsePreviewSnapshotMessage(input: unknown): PreviewSnapshotMessage | null {
  const record = readRecord(input);
  if (!record || record.source !== PREVIEW_SNAPSHOT_SOURCE) return null;
  if (readString(record.type) !== "snapshot") return null;
  const html = readNonEmptyString(record.html);
  if (!html) return null;
  return { source: PREVIEW_SNAPSHOT_SOURCE, type: "snapshot", html };
}

const BODY_REGEX = /<body[^>]*>([\s\S]*)<\/body>/i;
const VISIBLE_ELEMENT_REGEX = /<(img|svg|canvas|video|picture|table)\b/i;
const WHITESPACE_AND_TAGS_REGEX = /<[^>]*>/g;

export function isNonTrivialSnapshot(html: string): boolean {
  const bodyMatch = BODY_REGEX.exec(html);
  const bodyContent = bodyMatch ? bodyMatch[1] : html;
  const text = bodyContent.replace(WHITESPACE_AND_TAGS_REGEX, "").trim();
  if (text.length > 0) return true;
  if (VISIBLE_ELEMENT_REGEX.test(bodyContent)) return true;
  return false;
}
