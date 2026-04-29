import * as React from "react";

export function usePersistentState<T>(
  key: string,
  initial: T,
  parse: (raw: string) => T = JSON.parse,
  serialize: (value: T) => string = JSON.stringify,
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = React.useState<T>(() => {
    if (typeof window === "undefined") return initial;
    const raw = window.localStorage.getItem(key);
    if (raw === null) return initial;
    try {
      return parse(raw);
    } catch {
      return initial;
    }
  });

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(key, serialize(value));
  }, [key, serialize, value]);

  return [value, setValue];
}
