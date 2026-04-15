/**
 * Files — writes are daemon-routed unix-tool wrappers. Reads (list/read with
 * mime detection) are TanStack Start server functions; see `server.ts`.
 */
import type { CommandFunctionSpec } from "~/core/types";

export interface FsEntry {
  name: string;
  path: string;
  type: "file" | "dir" | "symlink";
  size: number;
  mtime: number;
  hidden: boolean;
}

export interface FsListResult {
  cwd: string;
  parent: string | null;
  entries: FsEntry[];
}

export interface FsReadResult {
  name: string;
  path: string;
  size: number;
  mime: string;
  encoding: "utf8" | "base64";
  content: string;
  truncated: boolean;
}

export const mkdir: CommandFunctionSpec = {
  name: "files.mkdir",
  returns: "void",
  executor: { kind: "exec", command: "mkdir", args: ["-p", "{{path}}"] },
};

export const rm: CommandFunctionSpec = {
  name: "files.rm",
  returns: "void",
  executor: { kind: "exec", command: "rm", args: ["-rf", "{{path}}"] },
};

export const rename: CommandFunctionSpec = {
  name: "files.rename",
  returns: "void",
  executor: { kind: "exec", command: "mv", args: ["{{from}}", "{{to}}"] },
};

export const touch: CommandFunctionSpec = {
  name: "files.touch",
  returns: "void",
  executor: { kind: "exec", command: "touch", args: ["{{path}}"] },
};
