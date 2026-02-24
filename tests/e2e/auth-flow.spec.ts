import { expect, test } from "@playwright/test";

test.describe("Auth flow", () => {
  test("login page loads with sign-in buttons", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText("Sign in to Pub")).toBeVisible();
    await expect(page.getByRole("button", { name: /GitHub/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Google/i })).toBeVisible();
  });

  test("dashboard redirects unauthenticated users to /login", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForURL("**/login", { timeout: 10_000 });
    expect(page.url()).toContain("/login");
  });

  test("GitHub button initiates OAuth via Convex", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("button", { name: /GitHub/i })).toBeVisible();

    const [request] = await Promise.all([
      page.waitForRequest((req) => req.url().includes("convex") && req.url().includes("github"), {
        timeout: 10_000,
      }),
      page.getByRole("button", { name: /GitHub/i }).click(),
    ]);

    const redirectUrl = request.url();
    expect(redirectUrl).toContain("/api/auth/signin/github");
    const redirect = new URL(redirectUrl);
    const redirectTo = redirect.searchParams.get("redirectTo");
    expect(redirectTo).not.toBeNull();
    if (redirectTo?.startsWith("http://") || redirectTo?.startsWith("https://")) {
      expect(new URL(redirectTo).pathname).toBe("/dashboard");
    } else {
      expect(redirectTo).toBe("/dashboard");
    }
  });
});
