import { strictShell } from "~/core/command-shell";
import {
  readArray,
  readBoolean,
  readNullableString,
  readRecordValue,
  readString,
  readStringArray,
} from "~/core/json-boundary";
import type { CommandFunctionSpec } from "~/core/types";

export interface MailMessage {
  id: string;
  threadId: string;
  from: string;
  to: string | null;
  subject: string;
  date: string;
  snippet: string;
  unread: boolean;
  labels: string[];
}

export interface MailMessageDetail extends MailMessage {
  body: string;
  bodyHtml: string | null;
}

export interface MailListResult {
  messages: MailMessage[];
}

export const listInbox: CommandFunctionSpec = {
  name: "mail.list",
  returns: "json",
  executor: strictShell(
    "gog -j gmail search '{{query}}' --max {{max}} | " +
      'jq \'{messages: [.threads[]? | {id, threadId: .id, from, to: .to, subject: (.subject // "(no subject)"),' +
      ' date, snippet: (.snippet // ""), unread: (.labels|index("UNREAD")!=null), labels}]}\'',
  ),
};

export const readMessage: CommandFunctionSpec = {
  name: "mail.read",
  returns: "json",
  executor: strictShell(
    "gog -j gmail get {{id}} | " +
      "jq '{id: .message.id, threadId: .message.threadId, from: .headers.from, to: .headers.to, " +
      'subject: (.headers.subject // "(no subject)"), date: .headers.date, ' +
      'snippet: (.message.snippet // ""), unread: (.message.labelIds|index("UNREAD")!=null), ' +
      'labels: .message.labelIds, body: (.body // ""), bodyHtml: null}\'',
  ),
};

export const archiveMessage: CommandFunctionSpec = {
  name: "mail.archive",
  returns: "void",
  executor: { kind: "exec", command: "gog", args: ["gmail", "archive", "{{id}}"] },
};

export const trashMessage: CommandFunctionSpec = {
  name: "mail.trash",
  returns: "void",
  executor: { kind: "exec", command: "gog", args: ["gmail", "trash", "{{id}}"] },
};

export const markAsRead: CommandFunctionSpec = {
  name: "mail.markRead",
  returns: "void",
  executor: {
    kind: "exec",
    command: "gog",
    args: ["gmail", "mark-read", "{{id}}"],
  },
};

export const starMessage: CommandFunctionSpec = {
  name: "mail.star",
  returns: "void",
  executor: {
    kind: "exec",
    command: "gog",
    args: ["gmail", "messages", "modify", "{{id}}", "--add", "STARRED"],
  },
};

export const sendDraft: CommandFunctionSpec = {
  name: "mail.draft",
  returns: "void",
  executor: {
    kind: "exec",
    command: "gog",
    args: [
      "gmail",
      "drafts",
      "create",
      "--to",
      "{{to}}",
      "--subject",
      "{{subject}}",
      "--body",
      "{{body}}",
    ],
  },
};

export const sendMessage: CommandFunctionSpec = {
  name: "mail.send",
  returns: "void",
  executor: {
    kind: "exec",
    command: "gog",
    args: ["gmail", "send", "--to", "{{to}}", "--subject", "{{subject}}", "--body", "{{body}}"],
  },
};

function parseMailMessage(value: unknown, path: string): MailMessage {
  const record = readRecordValue(value, path);
  return {
    id: readString(record, "id", path),
    threadId: readString(record, "threadId", path),
    from: readString(record, "from", path),
    to: readNullableString(record, "to", path),
    subject: readString(record, "subject", path),
    date: readString(record, "date", path),
    snippet: readString(record, "snippet", path),
    unread: readBoolean(record, "unread", path),
    labels: readStringArray(record, "labels", path),
  };
}

export function parseMailListResult(value: unknown): MailListResult {
  const path = "mail.list";
  const record = readRecordValue(value, path);
  return {
    messages: readArray(record, "messages", path).map((message, index) =>
      parseMailMessage(message, `${path}.messages[${index}]`),
    ),
  };
}

export function parseMailMessageDetail(value: unknown): MailMessageDetail {
  const path = "mail.read";
  const record = readRecordValue(value, path);
  return {
    ...parseMailMessage(value, path),
    body: readString(record, "body", path),
    bodyHtml: readNullableString(record, "bodyHtml", path),
  };
}
