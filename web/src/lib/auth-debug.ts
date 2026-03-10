import { hasWindow } from "./has-window";

export type AuthDebugEntry = {
  at: string;
  event: string;
  href: string;
  data?: unknown;
};

const STORAGE_KEY = "pub.auth.debug";
const MAX_ENTRIES = 400;

function normalizeData(value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  return value;
}

function readLogUnsafe(): AuthDebugEntry[] {
  if (!hasWindow()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as AuthDebugEntry[];
  } catch {
    return [];
  }
}

function writeLogUnsafe(entries: AuthDebugEntry[]) {
  if (!hasWindow()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
  } catch (error) {
    console.warn("[auth-debug] failed to persist auth debug log", error);
  }
}

export function pushAuthDebug(event: string, data?: unknown) {
  if (!hasWindow()) return;
  const entry: AuthDebugEntry = {
    at: new Date().toISOString(),
    event,
    href: window.location.href,
    data: normalizeData(data),
  };
  const next = [...readLogUnsafe(), entry];
  writeLogUnsafe(next);
  console.info("[auth-debug]", entry.event, entry.data ?? {});
}

export function getAuthDebugLog() {
  return readLogUnsafe();
}

export function clearAuthDebugLog() {
  if (!hasWindow()) return;
  window.localStorage.removeItem(STORAGE_KEY);
}

export function initAuthDebug() {
  if (!hasWindow()) return;
  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  pushAuthDebug("app_boot", {
    path: url.pathname,
    search: url.search,
    hasCode: code !== null,
    codeType: code === null ? null : typeof code,
    codeLength: code?.length ?? 0,
  });
}
