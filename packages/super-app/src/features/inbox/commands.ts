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

export const listGitHubMilestones: CommandFunctionSpec = {
  name: "inbox.deadlines.github",
  returns: "json",
  executor: {
    kind: "shell",
    script:
      "REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || true); " +
      'if [ -n "$REPO" ]; then gh api "repos/$REPO/milestones?state=open"; else echo "[]"; fi',
  },
};

export const listTaskwarriorTasks: CommandFunctionSpec = {
  name: "inbox.deadlines.taskwarrior",
  returns: "json",
  executor: {
    kind: "shell",
    script: "taskwarrior export json 2>/dev/null || task export 2>/dev/null || echo '[]'",
  },
};

export const listFlaggedEmails: CommandFunctionSpec = {
  name: "inbox.deadlines.flaggedMail",
  returns: "json",
  executor: {
    kind: "shell",
    script:
      "gog -j gmail search 'is:starred OR is:important' --max 20 | " +
      "jq '{messages: [.threads[]? | {id, threadId: .id, from, subject: (.subject // \"(no subject)\"), date}]}'",
  },
};
