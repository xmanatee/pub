/**
 * Mail — backed by the `gog` Google Workspace CLI via daemon-routed shell
 * scripts. Each command returns parsed JSON ready for the UI.
 */
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

export const listInbox: CommandFunctionSpec = {
  name: "mail.list",
  returns: "json",
  executor: {
    kind: "shell",
    script:
      "gog -j gmail search '{{query}}' --max {{max}} | " +
      'jq \'{messages: [.threads[]? | {id, threadId: .id, from, to: .to, subject: (.subject // "(no subject)"),' +
      ' date, snippet: (.snippet // ""), unread: (.labels|index("UNREAD")!=null), labels}]}\'',
  },
};

export const readMessage: CommandFunctionSpec = {
  name: "mail.read",
  returns: "json",
  executor: {
    kind: "shell",
    script:
      "gog -j gmail get --id {{id}} | " +
      'jq \'{id, threadId, from, to, subject: (.subject // "(no subject)"), date, ' +
      'snippet: (.snippet // ""), unread: (.labels|index("UNREAD")!=null), labels, ' +
      'body: (.bodyText // .body // ""), bodyHtml: (.bodyHtml // null)}\'',
  },
};

export const archiveMessage: CommandFunctionSpec = {
  name: "mail.archive",
  returns: "void",
  executor: { kind: "exec", command: "gog", args: ["gmail", "archive", "--id", "{{id}}"] },
};

export const trashMessage: CommandFunctionSpec = {
  name: "mail.trash",
  returns: "void",
  executor: { kind: "exec", command: "gog", args: ["gmail", "trash", "--id", "{{id}}"] },
};

export const markAsRead: CommandFunctionSpec = {
  name: "mail.markRead",
  returns: "void",
  executor: {
    kind: "exec",
    command: "gog",
    args: ["gmail", "modify", "--id", "{{id}}", "--remove-label", "UNREAD"],
  },
};

export const starMessage: CommandFunctionSpec = {
  name: "mail.star",
  returns: "void",
  executor: { kind: "exec", command: "gog", args: ["gmail", "star", "--id", "{{id}}"] },
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
