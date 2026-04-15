/** Human-readable byte size (B / KB / MB / GB). */
export function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

/**
 * Hours+minutes for a timestamp. `relative: true` returns just time for today,
 * short month+day for older timestamps.
 */
export function fmtTime(tsMs: number, relative = false): string {
  const date = new Date(tsMs);
  if (relative) {
    const now = new Date();
    const sameDay =
      date.getDate() === now.getDate() &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear();
    if (!sameDay) return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** Short weekday + month + day (e.g. "Wed, Apr 15"). */
export function fmtDate(tsMs: number): string {
  return new Date(tsMs).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
