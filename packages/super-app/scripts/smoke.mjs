import { chromium } from "playwright";

const base = process.argv[2] || "http://localhost:5173";
const routes = ["/", "/files", "/reader", "/tracker", "/notes", "/tasks", "/telegram"];

const browser = await chromium.launch({ headless: true });
const summary = [];
for (const route of routes) {
  const page = await browser.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text().slice(0, 240));
  });
  await page
    .goto(`${base}${route}`, { waitUntil: "domcontentloaded", timeout: 20000 })
    .catch(() => {});
  await page.waitForTimeout(3500);
  const body = await page.evaluate(() => document.body.innerText).catch(() => "");
  summary.push({
    route,
    pageErrors: [...new Set(pageErrors)].slice(0, 2),
    consoleErrors: [...new Set(consoleErrors)].slice(0, 2),
    body: (body || "").replace(/\s+/g, " ").slice(0, 140),
  });
  await page.close();
}
await browser.close();
console.log(JSON.stringify(summary, null, 2));
