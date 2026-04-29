/**
 * Register keyboard shortcuts on the document. Keys use a normalized form:
 * "Escape", "Enter", "Mod+K" (Mod = Cmd on Mac, Ctrl elsewhere), "Shift+/", etc.
 *
 * Bindings are matched against `document.activeElement`; shortcuts inside an
 * editable element fire only when prefixed with `Mod+` to avoid eating typing.
 */
import * as React from "react";

const isMac =
  typeof navigator !== "undefined" &&
  /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent);

export type ShortcutMap = Record<string, (e: KeyboardEvent) => void>;

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

function describe(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.metaKey || e.ctrlKey) parts.push("Mod");
  if (e.shiftKey) parts.push("Shift");
  if (e.altKey) parts.push("Alt");
  parts.push(e.key.length === 1 ? e.key.toUpperCase() : e.key);
  return parts.join("+");
}

export function useKeyboardShortcuts(map: ShortcutMap): void {
  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const key = describe(e);
      const handler = map[key];
      if (!handler) return;
      const editable = isEditable(e.target);
      if (editable && !key.startsWith("Mod+") && key !== "Escape") return;
      e.preventDefault();
      handler(e);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [map]);
}

export const MOD_KEY_LABEL = isMac ? "⌘" : "Ctrl";
