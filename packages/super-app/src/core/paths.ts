/** Expand a leading `~/` to the current user's home directory. */
export function expandHome(p: string): string {
  const env = typeof process === "object" && process && "env" in process ? process.env : undefined;
  const home = env?.HOME || env?.USERPROFILE || "~";
  if (p === "~") return home;
  if (p.startsWith("~/")) return `${home.replace(/\/+$/, "")}/${p.slice(2)}`;
  return p;
}
