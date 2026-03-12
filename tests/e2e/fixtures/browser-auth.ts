/**
 * Browser auth fixture for E2E tests.
 * Injects Convex Auth tokens into localStorage so the browser
 * authenticates without needing OAuth flows.
 *
 * Storage keys follow @convex-dev/auth conventions:
 *   key = `__convexAuth{Type}_${escapedNamespace}`
 *   namespace = "pub-auth" → escaped = "pubauth"
 *
 * Flow: We inject a dummy JWT + real refresh token. On load, the provider
 * sends the dummy JWT, server rejects it, provider exchanges the refresh
 * token via auth:signIn to get a valid JWT.
 */
import type { Page } from "@playwright/test";
import type { TestUser } from "./convex";

const NAMESPACE = "pubauth"; // "pub-auth" with non-alphanumeric stripped
const REFRESH_TOKEN_KEY = `__convexAuthRefreshToken_${NAMESPACE}`;
const JWT_KEY = `__convexAuthJWT_${NAMESPACE}`;

/**
 * Inject auth tokens into localStorage BEFORE the page loads.
 * Uses addInitScript so the token is available when ConvexAuthProvider initializes.
 * Must be called BEFORE navigating to any app route.
 */
export async function injectAuth(page: Page, user: TestUser): Promise<void> {
  await page.addInitScript(
    ({ jwtKey, refreshKey, token }) => {
      localStorage.setItem(refreshKey, token);
      // Set a dummy JWT so the provider attempts to use it, gets rejected,
      // and then exchanges the refresh token for a real JWT.
      localStorage.setItem(jwtKey, "stale");
    },
    { jwtKey: JWT_KEY, refreshKey: REFRESH_TOKEN_KEY, token: user.refreshToken },
  );
}

/**
 * Clear auth tokens from localStorage.
 */
export async function clearAuth(page: Page): Promise<void> {
  await page.evaluate(
    ({ refreshKey, jwtKey }) => {
      localStorage.removeItem(refreshKey);
      localStorage.removeItem(jwtKey);
    },
    { refreshKey: REFRESH_TOKEN_KEY, jwtKey: JWT_KEY },
  );
}

/**
 * Check if the page is authenticated (has the auth refresh token).
 */
export async function isAuthenticated(page: Page): Promise<boolean> {
  return page.evaluate((key) => {
    return localStorage.getItem(key) !== null;
  }, REFRESH_TOKEN_KEY);
}
