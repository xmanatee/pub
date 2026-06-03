import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.BASE_URL ?? "http://localhost:3000";
const inDockerWebSuite = process.env.E2E_SUITE === "web";

export default defineConfig({
  testDir: "./tests/e2e/specs",
  outputDir: inDockerWebSuite ? "../test-results/web" : "/tmp/pub-web-e2e-test-results",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [
    [
      "html",
      {
        open: "never",
        outputFolder: inDockerWebSuite
          ? "../playwright-report/web"
          : "/tmp/pub-web-e2e-playwright-report",
      },
    ],
    ["list"],
  ],
  use: {
    baseURL,
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
});
