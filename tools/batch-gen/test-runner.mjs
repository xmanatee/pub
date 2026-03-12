#!/usr/bin/env node

import { chromium } from "playwright";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { createServer } from "http";
import { resolve } from "path";

const pubDir = process.argv[2];
if (!pubDir) {
  console.error("Usage: node test-runner.mjs <pub-directory>");
  process.exit(1);
}

const htmlPath = resolve(pubDir, "index.html");
const mocksPath = resolve(pubDir, "mocks.json");
const reportPath = resolve(pubDir, "test-report.json");
const screenshotPath = resolve(pubDir, "screenshot.png");
const screenshotAfterPath = resolve(pubDir, "screenshot-after.png");

if (!existsSync(htmlPath)) {
  console.error(`index.html not found in ${pubDir}`);
  process.exit(1);
}

const mocks = existsSync(mocksPath)
  ? JSON.parse(readFileSync(mocksPath, "utf-8"))
  : {};

const html = readFileSync(htmlPath, "utf-8");
const server = createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

const consoleLogs = [];
page.on("console", (msg) => {
  consoleLogs.push({
    type: msg.type(),
    text: msg.text(),
    location: msg.location(),
  });
});
page.on("pageerror", (err) => {
  consoleLogs.push({
    type: "uncaught-error",
    text: err.message,
    stack: err.stack,
  });
});

await page.addInitScript((mockData) => {
  window.pub = {
    commands: new Proxy(
      {},
      {
        get(_target, prop) {
          if (typeof prop !== "string") return undefined;
          return async function () {
            if (prop in mockData) {
              const mock = mockData[prop];
              if (mock.returns === "void") return null;
              return mock.value;
            }
            console.warn(`[pub-mock] Unknown command: ${prop}`);
            return null;
          };
        },
      }
    ),
    command: async function (name) {
      if (name in mockData) {
        const mock = mockData[name];
        if (mock.returns === "void") return null;
        return mock.value;
      }
      console.warn(`[pub-mock] Unknown command: ${name}`);
      return null;
    },
  };
}, mocks);

try {
  await page.goto(`http://127.0.0.1:${port}`, {
    waitUntil: "networkidle",
    timeout: 30000,
  });
} catch (e) {
  consoleLogs.push({ type: "navigation-error", text: e.message });
}

await page.waitForTimeout(3000);
await page.screenshot({ path: screenshotPath, fullPage: true });

let buttonsClicked = 0;
try {
  const els = await page.$$(
    "button:visible, [role='button']:visible, input[type='submit']:visible"
  );
  for (const el of els.slice(0, 5)) {
    try {
      await el.click({ timeout: 2000 });
      buttonsClicked++;
      await page.waitForTimeout(500);
    } catch {}
  }
} catch {}

await page.waitForTimeout(1000);
await page.screenshot({ path: screenshotAfterPath, fullPage: true });

const errors = consoleLogs.filter(
  (l) =>
    l.type === "error" ||
    l.type === "uncaught-error" ||
    l.type === "navigation-error"
);

writeFileSync(
  reportPath,
  JSON.stringify(
    {
      timestamp: new Date().toISOString(),
      errors: errors.length,
      warnings: consoleLogs.filter((l) => l.type === "warning").length,
      totalLogs: consoleLogs.length,
      buttonsClicked,
      consoleLogs,
    },
    null,
    2
  )
);

await browser.close();
server.close();

if (errors.length > 0) {
  console.error(`FAIL: ${errors.length} error(s)`);
  for (const e of errors) console.error(`  [${e.type}] ${e.text}`);
  process.exit(1);
} else {
  console.log(
    `PASS: No errors (${consoleLogs.filter((l) => l.type === "warning").length} warnings, ${buttonsClicked} buttons clicked)`
  );
}
