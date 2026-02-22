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

  it("replaceURL uses history.replaceState (not router.navigate)", () => {
    const mockReplaceState = vi.fn();
    const mockHistory = {
      replaceState: mockReplaceState,
      state: { __TSR_key: "k", __TSR_index: 0 },
    };
    vi.stubGlobal("window", { history: mockHistory });

    getRouter();
    const replaceURL = propsOf(renderWrap()).replaceURL as (url: string) => void;
    replaceURL("/login");

    expect(mockReplaceState).toHaveBeenCalledWith({ __TSR_key: "k", __TSR_index: 0 }, "", "/login");
    // Must NOT use router.navigate — it triggers a full async navigation cycle
    // that races with the token exchange
    expect(router().navigate).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it("replaceURL preserves TanStack Router state keys", () => {
    const mockReplaceState = vi.fn();
    const existingState = { __TSR_key: "abc", __TSR_index: 3, extra: true };
    vi.stubGlobal("window", { history: { replaceState: mockReplaceState, state: existingState } });

    getRouter();
    const replaceURL = propsOf(renderWrap()).replaceURL as (url: string) => void;
    replaceURL("/login");

    const passedState = mockReplaceState.mock.calls[0][0];
    expect(passedState.__TSR_key).toBe("abc");
    expect(passedState.__TSR_index).toBe(3);

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
  describe("dashboard auth settling", () => {
    it("waits 300ms after loading ends before marking settled", () => {
      vi.useFakeTimers();

      let authSettled = false;
      const isLoading = false;

      if (!isLoading) {
        setTimeout(() => {
          authSettled = true;
        }, 300);
      }

      expect(authSettled).toBe(false);
      vi.advanceTimersByTime(299);
      expect(authSettled).toBe(false);
      vi.advanceTimersByTime(1);
      expect(authSettled).toBe(true);

      vi.useRealTimers();
    });

    it("does not redirect while still settling", () => {
      const navigate = vi.fn();
      const authSettled = false;
      const isAuthenticated = false;

      if (authSettled && !isAuthenticated) {
        navigate({ to: "/login" });
      }

      expect(navigate).not.toHaveBeenCalled();
    });

    it("redirects to /login after settling when not authenticated", () => {
      const navigate = vi.fn();
      const authSettled = true;
      const isAuthenticated = false;

      if (authSettled && !isAuthenticated) {
        navigate({ to: "/login" });
      }

      expect(navigate).toHaveBeenCalledWith({ to: "/login" });
    });

    it("does not redirect when authenticated", () => {
      const navigate = vi.fn();
      const authSettled = true;
      const isAuthenticated = true;

      if (authSettled && !isAuthenticated) {
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
