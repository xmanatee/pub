import { expect, type Page, test } from "@playwright/test";

type ConvexActionRequest = {
  path?: string;
  args?: Array<{
    provider?: string;
    params?: {
      redirectTo?: string;
    };
  }>;
};

async function gotoLogin(page: Page) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await expect(page).toHaveURL(/\/login(?:\?.*)?$/, { timeout: 15_000 });
}

test.describe("Auth flow", () => {
  test("login page loads with sign-in buttons", async ({ page }) => {
    await gotoLogin(page);
    await expect(page.getByText("Sign in to Pub", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("button", { name: /GitHub/i })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: /Google/i })).toBeVisible({ timeout: 15_000 });
  });

  test("dashboard redirects unauthenticated users to /login", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForURL("**/login", { timeout: 10_000 });
    expect(page.url()).toContain("/login");
  });

  test.skip("GitHub button initiates OAuth via Convex", async ({ page }) => {
    await gotoLogin(page);
    await expect(page.getByRole("button", { name: /GitHub/i })).toBeVisible({ timeout: 15_000 });

    const requestPromise = page.waitForRequest((request) => {
      if (!request.url().endsWith("/api/action") || request.method() !== "POST") {
        return false;
      }

      const body = request.postDataJSON() as ConvexActionRequest | null;
      return body?.path === "auth:signIn";
    });

    await page.getByRole("button", { name: /GitHub/i }).click();

    const request = await requestPromise;
    const body = request.postDataJSON() as ConvexActionRequest | null;
    expect(body?.path).toBe("auth:signIn");
    expect(body?.args?.[0]?.provider).toBe("github");
    expect(body?.args?.[0]?.params?.redirectTo).toBe("/dashboard");
    await expect(
      page.getByRole("button", { name: /Connecting…|Connecting\.\.\./i }),
    ).toBeDisabled();
  });
});
