/**
 * Command catalog — the single source of truth for what the super-app can do.
 *
 * Each entry is `name → spec`. The dispatcher reads this file on every call
 * (via Vite `ssrLoadModule`), so edits to the manifest or any handler are
 * picked up live without restarting Vite.
 *
 * To add a capability:
 *   1. Add an entry below.
 *   2. For `kind: "handler"`, add the function in `commands/handlers/<module>.ts`.
 *   3. Call it from the UI with `invoke("your.name", args)` or `useCommand`.
 */

import type { CommandSpec } from "./types";

export const COMMANDS = {
  "gmail.unread": { kind: "handler", module: "gmail", fn: "unread" },
  "gmail.search": { kind: "handler", module: "gmail", fn: "search" },
  "gmail.message": { kind: "handler", module: "gmail", fn: "message" },
  "calendar.today": { kind: "handler", module: "calendar", fn: "today" },
  "calendar.upcoming": { kind: "handler", module: "calendar", fn: "upcoming" },
  "fs.list": { kind: "handler", module: "fs", fn: "list" },
  "fs.read": { kind: "handler", module: "fs", fn: "read" },
  "fs.write": { kind: "handler", module: "fs", fn: "write" },
  "fs.mkdir": { kind: "handler", module: "fs", fn: "mkdir" },
  "fs.rm": { kind: "handler", module: "fs", fn: "rm" },
  "fs.rename": { kind: "handler", module: "fs", fn: "rename" },
  "reader.fetch": { kind: "handler", module: "reader", fn: "fetch" },
  "weather.current": { kind: "handler", module: "weather", fn: "current" },
  "news.hn": { kind: "handler", module: "news", fn: "hn" },
  "tracker.list": { kind: "handler", module: "tracker", fn: "list" },
  "tracker.add": { kind: "handler", module: "tracker", fn: "add" },
  "tracker.delete": { kind: "handler", module: "tracker", fn: "del" },
  "telegram.auth.state": { kind: "handler", module: "telegram", fn: "authState" },
  "telegram.auth.send-code": { kind: "handler", module: "telegram", fn: "authSendCode" },
  "telegram.auth.verify": { kind: "handler", module: "telegram", fn: "authVerify" },
  "telegram.auth.password": { kind: "handler", module: "telegram", fn: "authPassword" },
  "telegram.auth.logout": { kind: "handler", module: "telegram", fn: "authLogout" },
  "telegram.dialogs": { kind: "handler", module: "telegram", fn: "dialogs" },
  "telegram.messages": { kind: "handler", module: "telegram", fn: "messages" },
  "telegram.send": { kind: "handler", module: "telegram", fn: "send" },
  "telegram.search": { kind: "handler", module: "telegram", fn: "search" },
} as const satisfies Record<string, CommandSpec>;
