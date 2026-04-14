/** @vitest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(
  globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  }
).IS_REACT_ACT_ENVIRONMENT = true;

type MatchMediaMock = {
  readonly matches: boolean;
  readonly media: string;
  addEventListener: (type: "change", listener: (event: MediaQueryListEvent) => void) => void;
  removeEventListener: (type: "change", listener: (event: MediaQueryListEvent) => void) => void;
};

function createMatchMedia(initial: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  let currentMatches = initial;

  const mql: MatchMediaMock = {
    media: "(prefers-color-scheme: dark)",
    get matches() {
      return currentMatches;
    },
    addEventListener: (_type, listener) => {
      listeners.add(listener);
    },
    removeEventListener: (_type, listener) => {
      listeners.delete(listener);
    },
  };

  function set(value: boolean) {
    currentMatches = value;
    const event = { matches: value, media: mql.media } as MediaQueryListEvent;
    for (const listener of listeners) listener(event);
  }

  return { mql, set };
}

function installMatchMedia(initial: boolean) {
  const { mql, set } = createMatchMedia(initial);
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn(() => mql),
  });
  return { set };
}

async function loadThemeModule(opts: { inTelegram: boolean; telegramIsDark?: boolean }) {
  vi.resetModules();
  let currentIsDark = opts.telegramIsDark ?? false;
  const listeners = new Set<() => void>();
  const isDarkSignal = Object.assign(() => currentIsDark, {
    sub: (cb: () => void) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
  });

  vi.doMock("@telegram-apps/sdk-react", async () => {
    const react = await import("react");
    return {
      miniApp: { isDark: isDarkSignal },
      useSignal: (signal: (() => boolean) & { sub: (cb: () => void) => () => void }) =>
        react.useSyncExternalStore(
          (notify) => signal.sub(notify),
          () => signal(),
          () => false,
        ),
    };
  });

  vi.doMock("./telegram", () => ({ IN_TELEGRAM: opts.inTelegram }));

  const mod = await import("./theme");
  return {
    mod,
    setTelegramIsDark: (value: boolean) => {
      currentIsDark = value;
      for (const cb of listeners) cb();
    },
  };
}

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("@telegram-apps/sdk-react");
  vi.doUnmock("./telegram");
  document.documentElement.classList.remove("dark");
});

describe("initTheme", () => {
  it("applies .dark when system prefers dark and not in Telegram", async () => {
    installMatchMedia(true);
    const { mod } = await loadThemeModule({ inTelegram: false });
    mod.initTheme();
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("removes .dark when system prefers light and not in Telegram", async () => {
    document.documentElement.classList.add("dark");
    installMatchMedia(false);
    const { mod } = await loadThemeModule({ inTelegram: false });
    mod.initTheme();
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("applies .dark when Telegram reports dark", async () => {
    installMatchMedia(false);
    const { mod } = await loadThemeModule({ inTelegram: true, telegramIsDark: true });
    mod.initTheme();
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("ignores system preference when in Telegram", async () => {
    installMatchMedia(true);
    const { mod } = await loadThemeModule({ inTelegram: true, telegramIsDark: false });
    mod.initTheme();
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});

describe("useThemeSync", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("reacts to system preference changes when not in Telegram", async () => {
    const { set } = installMatchMedia(false);
    const { mod } = await loadThemeModule({ inTelegram: false });

    function Consumer() {
      mod.useThemeSync();
      return null;
    }

    await act(async () => root.render(<Consumer />));
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    await act(async () => {
      set(true);
    });
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    await act(async () => {
      set(false);
    });
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("reacts to Telegram theme signal when in Telegram", async () => {
    installMatchMedia(false);
    const { mod, setTelegramIsDark } = await loadThemeModule({
      inTelegram: true,
      telegramIsDark: false,
    });

    function Consumer() {
      mod.useThemeSync();
      return null;
    }

    await act(async () => root.render(<Consumer />));
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    await act(async () => {
      setTelegramIsDark(true);
    });
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});
