import { homedir } from "node:os";
import { join } from "node:path";

/** Expand a leading `~/` to the current user's home directory. */
export function expandHome(p: string): string {
  if (p === "~") return homedir();
  if (p.startsWith("~/")) return join(homedir(), p.slice(2));
  return p;
}
