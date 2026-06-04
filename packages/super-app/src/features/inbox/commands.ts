import { strictShell } from "~/core/command-shell";
import {
  readArray,
  readArrayValue,
  readNullableString,
  readNumber,
  readOptionalNumber,
  readOptionalString,
  readRecordValue,
  readString,
} from "~/core/json-boundary";
import type { CommandFunctionSpec } from "~/core/types";

export interface GitHubMilestone {
  id: number;
  title: string;
  due_on: string | null;
  html_url: string;
  open_issues: number;
}

export interface TaskwarriorTask {
  uuid: string;
  description: string;
  due?: string;
  urgency?: number;
  status?: string;
}

export interface FlaggedMail {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  date: string;
}

export interface FlaggedMailResult {
  messages: FlaggedMail[];
}

export const listGitHubMilestones: CommandFunctionSpec = {
  name: "inbox.deadlines.github",
  returns: "json",
  executor: strictShell(
    "REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || true); " +
      'if [ -n "$REPO" ]; then gh api "repos/$REPO/milestones?state=open"; else echo "[]"; fi',
  ),
};

export const listTaskwarriorTasks: CommandFunctionSpec = {
  name: "inbox.deadlines.taskwarrior",
  returns: "json",
  executor: strictShell(
    "taskwarrior export json 2>/dev/null || task export 2>/dev/null || echo '[]'",
  ),
};

export const listFlaggedEmails: CommandFunctionSpec = {
  name: "inbox.deadlines.flaggedMail",
  returns: "json",
  executor: strictShell(
    "gog -j gmail search 'is:starred OR is:important' --max 20 | " +
      "jq '{messages: [.threads[]? | {id, threadId: .id, from, subject: (.subject // \"(no subject)\"), date}]}'",
  ),
};

function parseGitHubMilestone(value: unknown, path: string): GitHubMilestone {
  const record = readRecordValue(value, path);
  return {
    id: readNumber(record, "id", path),
    title: readString(record, "title", path),
    due_on: readNullableString(record, "due_on", path),
    html_url: readString(record, "html_url", path),
    open_issues: readNumber(record, "open_issues", path),
  };
}

export function parseGitHubMilestones(value: unknown): GitHubMilestone[] {
  const path = "inbox.deadlines.github";
  return readArrayValue(value, path).map((milestone, index) =>
    parseGitHubMilestone(milestone, `${path}[${index}]`),
  );
}

function parseTaskwarriorTask(value: unknown, path: string): TaskwarriorTask {
  const record = readRecordValue(value, path);
  return {
    uuid: readString(record, "uuid", path),
    description: readString(record, "description", path),
    due: readOptionalString(record, "due", path),
    urgency: readOptionalNumber(record, "urgency", path),
    status: readOptionalString(record, "status", path),
  };
}

export function parseTaskwarriorTasks(value: unknown): TaskwarriorTask[] {
  const path = "inbox.deadlines.taskwarrior";
  return readArrayValue(value, path).map((task, index) =>
    parseTaskwarriorTask(task, `${path}[${index}]`),
  );
}

function parseFlaggedMail(value: unknown, path: string): FlaggedMail {
  const record = readRecordValue(value, path);
  return {
    id: readString(record, "id", path),
    threadId: readString(record, "threadId", path),
    from: readString(record, "from", path),
    subject: readString(record, "subject", path),
    date: readString(record, "date", path),
  };
}

export function parseFlaggedMailResult(value: unknown): FlaggedMailResult {
  const path = "inbox.deadlines.flaggedMail";
  const record = readRecordValue(value, path);
  return {
    messages: readArray(record, "messages", path).map((message, index) =>
      parseFlaggedMail(message, `${path}.messages[${index}]`),
    ),
  };
}
