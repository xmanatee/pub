import type { FsListResult, FsReadResult } from "./commands";
import { listFiles, readFileContents } from "./server";

export const files = {
  list: (path: string): Promise<FsListResult> => listFiles({ data: { path } }),
  read: (path: string): Promise<FsReadResult> => readFileContents({ data: { path } }),
};
