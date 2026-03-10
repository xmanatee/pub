import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  createRouter: vi.fn((config: Record<string, unknown>) => {
    return { config, navigate: vi.fn(), subscribe: vi.fn() };
  }),
}));

vi.mock("@convex-dev/react-query", () => ({
  ConvexQueryClient: vi.fn(() => ({
    hashFn: () => vi.fn(),
    queryFn: () => vi.fn(),
    connect: vi.fn(),
    convexClient: { __mock: true },
  })),
}));

vi.mock("@sentry/react", () => ({ captureException: vi.fn() }));

vi.mock("@tanstack/react-query", () => ({
  QueryClient: vi.fn(() => ({})),
  MutationCache: vi.fn(() => ({})),
  notifyManager: { setScheduler: vi.fn() },
}));

vi.mock("posthog-js", () => ({ default: { capture: vi.fn() } }));

vi.mock("./routeTree.gen", () => ({ routeTree: {} }));

vi.stubGlobal("window", {
  requestAnimationFrame: vi.fn(),
  history: { state: {}, replaceState: vi.fn() },
});

import { getRouter } from "./router";

describe("getRouter", () => {
  it("returns router, queryClient, and convexClient", () => {
    const result = getRouter();
    expect(result.router).toBeDefined();
    expect(result.queryClient).toBeDefined();
    expect(result.convexClient).toEqual({ __mock: true });
  });

  it("router has no Wrap (auth provider is in main.tsx)", () => {
    const result = getRouter();
    const config = (result.router as unknown as { config: Record<string, unknown> }).config;
    expect(config.Wrap).toBeUndefined();
  });
});
