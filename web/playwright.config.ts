import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e/specs",
  // This suite is dominated by tall-viewport visual tests and heavy debug pages.
  // Running everything fully parallel with the default worker count can starve
  // browser page creation under local load, leading to fixture setup timeouts.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 4,
  reporter: "html",
  use: {
    baseURL: "http://127.0.0.1:3000",
    locale: "en-US",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    timezoneId: "UTC",
  },

  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        headless: true,
        launchOptions: {
          args: ["--font-render-hinting=none", "--disable-skia-runtime-opts", "--disable-lcd-text"],
        },
      },
    },
  ],

  webServer: {
    command: "env -u NO_COLOR VITE_CONVEX_URL=https://example.convex.cloud pnpm dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
