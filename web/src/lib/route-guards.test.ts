import { isRedirect } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { type AuthState, requireAuth, requireGuest } from "./route-guards";

function callGuard(fn: () => void): { redirected: true; thrown: unknown } | { redirected: false } {
  try {
    fn();
    return { redirected: false };
  } catch (e) {
    if (isRedirect(e)) return { redirected: true, thrown: e };
    throw e;
  }
}

describe("requireAuth", () => {
  it("throws redirect when resolved and not authenticated", () => {
    const auth: AuthState = { isLoading: false, isAuthenticated: false };
    const result = callGuard(() => requireAuth(auth));
    expect(result.redirected).toBe(true);
    expect(isRedirect(result.redirected ? (result as { thrown: unknown }).thrown : null)).toBe(
      true,
    );
  });

  it("does not redirect while loading", () => {
    const auth: AuthState = { isLoading: true, isAuthenticated: false };
    expect(callGuard(() => requireAuth(auth)).redirected).toBe(false);
  });

  it("does not redirect when authenticated", () => {
    const auth: AuthState = { isLoading: false, isAuthenticated: true };
    expect(callGuard(() => requireAuth(auth)).redirected).toBe(false);
  });
});

describe("requireGuest", () => {
  it("throws redirect when resolved and authenticated", () => {
    const auth: AuthState = { isLoading: false, isAuthenticated: true };
    const result = callGuard(() => requireGuest(auth));
    expect(result.redirected).toBe(true);
  });

  it("does not redirect while loading", () => {
    const auth: AuthState = { isLoading: true, isAuthenticated: true };
    expect(callGuard(() => requireGuest(auth)).redirected).toBe(false);
  });

  it("does not redirect when not authenticated", () => {
    const auth: AuthState = { isLoading: false, isAuthenticated: false };
    expect(callGuard(() => requireGuest(auth)).redirected).toBe(false);
  });
});
