/** @vitest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(
  globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  }
).IS_REACT_ACT_ENVIRONMENT = true;

let mockIsAuthenticated = true;
let mockIsLoading = false;
let mockTelegramFullscreen = false;
let mockInTelegram = false;
let mockRouteIds: string[] = ["/other"];

vi.mock("convex/react", () => ({
  useConvexAuth: () => ({
    isAuthenticated: mockIsAuthenticated,
    isLoading: mockIsLoading,
  }),
}));

vi.mock("@tanstack/react-router", () => ({
  useMatches: () => mockRouteIds.map((routeId) => ({ routeId })),
}));

vi.mock("@telegram-apps/sdk-react", () => ({
  useSignal: () => mockTelegramFullscreen,
}));

vi.mock("~/lib/telegram", () => ({
  get IN_TELEGRAM() {
    return mockInTelegram;
  },
  isFullscreen: { mock: true },
}));

import { useHeaderNavVisible } from "./use-header-nav-visible";

function Probe({ onValue }: { onValue: (value: boolean) => void }) {
  const value = useHeaderNavVisible();
  onValue(value);
  return null;
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  mockIsAuthenticated = true;
  mockIsLoading = false;
  mockTelegramFullscreen = false;
  mockInTelegram = false;
  mockRouteIds = ["/_authenticated", "/_authenticated/pubs"];
});

afterEach(async () => {
  const current = root;
  if (current) {
    await act(async () => {
      current.unmount();
    });
  }
  root = null;
  container?.remove();
  container = null;
});

async function probe(): Promise<boolean> {
  const current = root;
  if (!current) throw new Error("root not initialized");
  let captured = false;
  await act(async () => {
    current.render(<Probe onValue={(v) => (captured = v)} />);
  });
  return captured;
}

describe("useHeaderNavVisible", () => {
  it("is true on a normal authenticated route in the browser", async () => {
    expect(await probe()).toBe(true);
  });

  it("is false while auth is loading", async () => {
    mockIsLoading = true;
    expect(await probe()).toBe(false);
  });

  it("is false when unauthenticated", async () => {
    mockIsAuthenticated = false;
    expect(await probe()).toBe(false);
  });

  it("is false on fullscreen-takeover routes (pub)", async () => {
    mockRouteIds = ["__root__", "/p/$slug"];
    expect(await probe()).toBe(false);
  });

  it("is false on fullscreen-takeover routes (app)", async () => {
    mockRouteIds = ["__root__", "/_authenticated", "/_authenticated/app"];
    expect(await probe()).toBe(false);
  });

  it("is false inside Telegram when not fullscreen", async () => {
    mockInTelegram = true;
    mockTelegramFullscreen = false;
    expect(await probe()).toBe(false);
  });

  it("is true inside Telegram in fullscreen — nav stays reachable", async () => {
    mockInTelegram = true;
    mockTelegramFullscreen = true;
    expect(await probe()).toBe(true);
  });
});
