/**
 * Auto-save a value after `delayMs` of inactivity. The save handler runs
 * only when `value` changes; the initial render is skipped.
 */
import * as React from "react";

export function useDebouncedSave<T>(
  value: T,
  save: (value: T) => Promise<void> | void,
  delayMs = 800,
): { saving: boolean } {
  const [saving, setSaving] = React.useState(false);
  const valueRef = React.useRef(value);
  valueRef.current = value;
  const saveRef = React.useRef(save);
  saveRef.current = save;
  const initialized = React.useRef(false);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const run = React.useCallback(async () => {
    setSaving(true);
    try {
      await saveRef.current(valueRef.current);
    } finally {
      setSaving(false);
    }
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: schedule only when value changes
  React.useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(run, delayMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [value, delayMs]);

  return { saving };
}
