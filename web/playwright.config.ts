import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e/specs",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
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
    command: "VITE_CONVEX_URL=https://example.convex.cloud pnpm dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
