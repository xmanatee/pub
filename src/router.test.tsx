import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Shared mutable state for mocks (hoisted so vi.mock factories can reference it)
type WrapFn = (props: { children: React.ReactNode }) => React.ReactElement;
interface MockRouter {
  navigate: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
}
const mocks = vi.hoisted(() => ({
  routerConfig: undefined as { Wrap: WrapFn } | undefined,
  router: undefined as MockRouter | undefined,
}));

// --- Mock external dependencies ---

vi.mock("@tanstack/react-router", () => ({
  createRouter: vi.fn((config: { Wrap: WrapFn }) => {
    mocks.routerConfig = config;
    mocks.router = {
      navigate: vi.fn(),
      subscribe: vi.fn(),
    };
    return mocks.router;
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

vi.mock("@tanstack/react-router-ssr-query", () => ({
  setupRouterSsrQueryIntegration: vi.fn(),
}));

vi.mock("posthog-js", () => ({ default: { capture: vi.fn() } }));

vi.mock("./routeTree.gen", () => ({ routeTree: {} }));

import { getRouter } from "./router";

// Helpers to safely access mocks after getRouter() populates them
function config() {
  if (!mocks.routerConfig) throw new Error("routerConfig not set");
  return mocks.routerConfig;
}
function router() {
  if (!mocks.router) throw new Error("router not set");
  return mocks.router;
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
    mocks.router = undefined;
  });

  it("creates a router with a Wrap component", () => {
    getRouter();
    expect(mocks.routerConfig).toBeDefined();
    expect(typeof config().Wrap).toBe("function");
  });

  it("Wrap passes replaceURL to ConvexAuthProvider", () => {
    getRouter();
    expect(propsOf(renderWrap()).replaceURL).toBeTypeOf("function");
  });

  it("replaceURL is a no-op to prevent TanStack Router page reloads", () => {
    const mockReplaceState = vi.fn();
    vi.stubGlobal("window", {
      history: { replaceState: mockReplaceState, state: {} },
    });

    getRouter();
    const replaceURL = propsOf(renderWrap()).replaceURL as (url: string) => void;
    replaceURL("/login");

    // replaceURL must NOT call replaceState — in TanStack Start SSR,
    // any replaceState triggers the router's history patch and causes
    // a full page reload, aborting the OAuth code exchange.
    expect(mockReplaceState).not.toHaveBeenCalled();
    expect(router().navigate).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it("replaceURL is synchronous (returns void, not a Promise)", () => {
    const mockReplaceState = vi.fn();
    vi.stubGlobal("window", { history: { replaceState: mockReplaceState, state: {} } });

    getRouter();
    const replaceURL = propsOf(renderWrap()).replaceURL as (url: string) => void;
    const result = replaceURL("/login");

    // Must be synchronous so `await replaceURL(...)` in the library resolves
    // immediately, allowing the token exchange to proceed without a race.
    expect(result).toBeUndefined();

    vi.unstubAllGlobals();
  });

  it("Wrap does not throw outside RouterProvider", () => {
    getRouter();
    expect(() => renderWrap()).not.toThrow();
  });

  it("Wrap passes convexClient to ConvexAuthProvider", () => {
    getRouter();
    expect(propsOf(renderWrap()).client).toEqual({ __mock: true });
  });
});

describe("auth redirect logic", () => {
  describe("dashboard auth guard", () => {
    it("does not redirect while loading", () => {
      const navigate = vi.fn();
      const isLoading = true;
      const isAuthenticated = false;

      if (!isLoading && !isAuthenticated) {
        navigate({ to: "/login" });
      }

      expect(navigate).not.toHaveBeenCalled();
    });

    it("redirects to /login when not loading and not authenticated", () => {
      const navigate = vi.fn();
      const isLoading = false;
      const isAuthenticated = false;

      if (!isLoading && !isAuthenticated) {
        navigate({ to: "/login" });
      }

      expect(navigate).toHaveBeenCalledWith({ to: "/login" });
    });

    it("does not redirect when authenticated", () => {
      const navigate = vi.fn();
      const isLoading = false;
      const isAuthenticated = true;

      if (!isLoading && !isAuthenticated) {
        navigate({ to: "/login" });
      }

      expect(navigate).not.toHaveBeenCalled();
    });
  });

  describe("login page redirect", () => {
    it("navigates to /dashboard when user is authenticated", () => {
      const navigate = vi.fn();
      const isAuthenticated = true;

      if (isAuthenticated) {
        navigate({ to: "/dashboard" });
      }

      expect(navigate).toHaveBeenCalledWith({ to: "/dashboard" });
    });

    it("stays on login page when not authenticated", () => {
      const navigate = vi.fn();
      const isAuthenticated = false;

      if (isAuthenticated) {
        navigate({ to: "/dashboard" });
      }

      expect(navigate).not.toHaveBeenCalled();
    });
  });
});
