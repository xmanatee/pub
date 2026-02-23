import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Shared mutable state for mocks (hoisted so vi.mock factories can reference it)
type WrapFn = (props: { children: React.ReactNode }) => React.ReactElement;
const mocks = vi.hoisted(() => ({
  routerConfig: undefined as { Wrap: WrapFn } | undefined,
}));

// --- Mock external dependencies ---

vi.mock("@tanstack/react-router", () => ({
  createRouter: vi.fn((config: { Wrap: WrapFn }) => {
    mocks.routerConfig = config;
    return {
      navigate: vi.fn(),
      subscribe: vi.fn(),
    };
  }),
}));

vi.mock("@convex-dev/auth/react", () => ({
  ConvexAuthProvider: vi.fn(),
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

// Helpers
function config() {
  if (!mocks.routerConfig) throw new Error("routerConfig not set");
  return mocks.routerConfig;
}
function propsOf(element: React.ReactElement): Record<string, unknown> {
  return (element as unknown as { props: Record<string, unknown> }).props;
}
function renderWrap() {
  return config().Wrap({ children: React.createElement("div") });
}

describe("getRouter", () => {
  beforeEach(() => {
    mocks.routerConfig = undefined;
  });

  it("creates a router with a Wrap component", () => {
    getRouter();
    expect(mocks.routerConfig).toBeDefined();
    expect(typeof config().Wrap).toBe("function");
  });

  it("returns router and queryClient", () => {
    const result = getRouter();
    expect(result.router).toBeDefined();
    expect(result.queryClient).toBeDefined();
  });

  it("Wrap renders ConvexAuthProvider with convexClient", () => {
    getRouter();
    expect(propsOf(renderWrap()).client).toEqual({ __mock: true });
  });

  it("Wrap uses default replaceURL (no custom override)", () => {
    getRouter();
    expect(propsOf(renderWrap()).replaceURL).toBeUndefined();
  });

  it("Wrap does not throw outside RouterProvider", () => {
    getRouter();
    expect(() => renderWrap()).not.toThrow();
  });
});
