import type { CommandFunctionSpec } from "~/core/types";

export interface ReaderResult {
  url: string;
  title: string;
  byline: string | null;
  excerpt: string | null;
  contentHtml: string;
  textContent: string;
  siteName: string | null;
  publishedTime: string | null;
  fetchedAt: number;
}

export const fetchPage: CommandFunctionSpec = {
  name: "reader.fetch",
  returns: "text",
  executor: {
    kind: "exec",
    command: "curl",
    args: [
      "-sSL",
      "--max-time",
      "15",
      "-H",
      "user-agent: Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/126 Safari/537.36",
      "{{url}}",
    ],
  },
};
