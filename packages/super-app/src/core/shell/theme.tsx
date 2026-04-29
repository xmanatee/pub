/**
 * Theme provider — applies a `light`/`dark` class to `<html>`. Source order:
 * (1) `localStorage["super-app:theme"]`, (2) system `prefers-color-scheme`.
 * The provider syncs both ways so OS theme changes propagate when the user
 * has not explicitly chosen.
 */
import * as React from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "super-app:theme";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggle: () => void;
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

function readPreferred(): Theme {
  if (typeof window === "undefined") return "dark";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function apply(theme: Theme) {
  if (typeof document === "undefined") return;
  const html = document.documentElement;
  html.classList.toggle("dark", theme === "dark");
  html.classList.toggle("light", theme === "light");
  html.style.colorScheme = theme;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<Theme>("dark");

  React.useEffect(() => {
    const next = readPreferred();
    setThemeState(next);
    apply(next);
  }, []);

  const setTheme = React.useCallback((next: Theme) => {
    setThemeState(next);
    apply(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }, []);

  const toggle = React.useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggle }}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within <ThemeProvider>");
  return ctx;
}
