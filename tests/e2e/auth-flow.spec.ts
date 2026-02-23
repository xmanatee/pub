import { expect, test } from "@playwright/test";

test.describe("Auth flow diagnosis", () => {
  test("login page loads correctly", async ({ page }) => {
    const logs: string[] = [];
    page.on("console", (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));

    await page.goto("/login");
    await expect(page.getByText("Sign in to Pub")).toBeVisible();
    await expect(page.getByRole("button", { name: /GitHub/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Google/i })).toBeVisible();

    console.log("--- Login page console logs ---");
    for (const log of logs) console.log(log);
  });

  test("auth redirect behavior after OAuth callback simulation", async ({ page }) => {
    const logs: string[] = [];
    const requests: string[] = [];

    page.on("console", (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
    page.on("request", (req) => requests.push(`${req.method()} ${req.url()}`));

    // Navigate to login with a fake code param to simulate post-OAuth redirect
    await page.goto("/login?code=test-fake-code");

    // Wait a bit for React effects to fire and auth to attempt code exchange
    await page.waitForTimeout(3000);

    // Capture final URL — did the router strip `?code=`?
    const finalUrl = page.url();
    console.log("--- Final URL after ?code= navigation ---");
    console.log(finalUrl);

    console.log("\n--- Console logs (auth redirect) ---");
    for (const log of logs) console.log(log);

    // Check if replaceURL was called
    const replaceUrlLogs = logs.filter((l) => l.includes("[auth] replaceURL called:"));
    console.log("\n--- replaceURL calls ---");
    for (const log of replaceUrlLogs) console.log(log);

    // Check for auth state transitions
    const loginLogs = logs.filter((l) => l.includes("[login]"));
    console.log("\n--- [login] logs ---");
    for (const log of loginLogs) console.log(log);

    // Check network requests to Convex (auth-related)
    const convexRequests = requests.filter(
      (r) => r.includes("convex") && (r.includes("auth") || r.includes("token")),
    );
    console.log("\n--- Convex auth network requests ---");
    for (const req of convexRequests) console.log(req);

    // The code param should have been preserved long enough for signIn to see it
    // If this fails, the Transitioner is stripping it before React effects run
    const codeWasProcessed = replaceUrlLogs.length > 0 || logs.some((l) => l.includes("code"));
    console.log(`\nCode was processed: ${codeWasProcessed}`);
  });

  test("dashboard redirects unauthenticated users to /login", async ({ page }) => {
    const logs: string[] = [];
    page.on("console", (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));

    await page.goto("/dashboard");

    // Wait for redirect — dashboard should bounce us to /login
    await page.waitForURL("**/login", { timeout: 10_000 });

    console.log("--- Dashboard redirect logs ---");
    for (const log of logs) console.log(log);

    const dashboardLogs = logs.filter((l) => l.includes("[dashboard]"));
    console.log("\n--- [dashboard] specific logs ---");
    for (const log of dashboardLogs) console.log(log);

    expect(page.url()).toContain("/login");
  });

  test("OAuth redirect chain - GitHub button targets correct URL", async ({ page }) => {
    const logs: string[] = [];
    page.on("console", (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));

    await page.goto("/login");
    await expect(page.getByRole("button", { name: /GitHub/i })).toBeVisible();

    // Intercept navigation to capture the OAuth redirect URL
    const [request] = await Promise.all([
      page.waitForRequest(
        (req) => {
          const url = req.url();
          return url.includes("github.com") || url.includes("convex") || url.includes("auth");
        },
        { timeout: 10_000 },
      ),
      page.getByRole("button", { name: /GitHub/i }).click(),
    ]);

    const redirectUrl = request.url();
    console.log("--- OAuth redirect URL ---");
    console.log(redirectUrl);

    console.log("\n--- Console logs after click ---");
    for (const log of logs) console.log(log);
  });
});
