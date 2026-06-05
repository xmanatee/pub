import { chromium } from "playwright";

const inputBase = process.argv[2] || "http://localhost:5173";
const routes = [
  { path: "/", heading: "Command Center" },
  { path: "/files", heading: "Files" },
  { path: "/reader", heading: "Reader" },
  { path: "/tracker", heading: "Tracker" },
  { path: "/notes", heading: "Notes" },
  { path: "/tasks", heading: "Tasks" },
  { path: "/telegram", heading: "Telegram" },
  { path: "/contacts", heading: "Contacts" },
  { path: "/mail", heading: "Mail" },
  { path: "/calendar", heading: "Calendar" },
  { path: "/inbox", heading: "Inbox" },
  { path: "/settings", heading: "Settings" },
];

const browser = await chromium.launch({ headless: true });
try {
  const appBase = await resolveAppBase(browser, inputBase);
  const summary = [];
  for (const route of routes) {
    const page = await browser.newPage();
    const pageErrors = [];
    const consoleErrors = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text().slice(0, 240));
    });
    let status = null;
    let heading = "";
    try {
      const response = await page.goto(routeUrl(appBase, route.path), {
        waitUntil: "domcontentloaded",
        timeout: 20000,
      });
      status = response?.status() ?? null;
      await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
      heading = (await page.locator("main h1").first().textContent({ timeout: 5000 }))?.trim() ?? "";
    } catch (error) {
      pageErrors.push(error instanceof Error ? error.message : String(error));
    }
    await page.waitForTimeout(1000);
    let body = "";
    try {
      body = await page.evaluate(() => document.body.innerText);
    } catch (error) {
      pageErrors.push(error instanceof Error ? error.message : String(error));
    }
    summary.push({
      route: route.path,
      url: page.url(),
      status,
      heading,
      expectedHeading: route.heading,
      pageErrors: [...new Set(pageErrors)].slice(0, 2),
      consoleErrors: [...new Set(consoleErrors)].slice(0, 2),
      body: (body || "").replace(/\s+/g, " ").slice(0, 140),
    });
    await page.close();
  }
  console.log(JSON.stringify(summary, null, 2));
  if (summary.some(routeFailed)) process.exit(1);
} finally {
  await browser.close();
}

async function resolveAppBase(browser, base) {
  const page = await browser.newPage();
  try {
    await page.goto(base, { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
    return withTrailingSlash(page.url());
  } finally {
    await page.close();
  }
}

function routeUrl(appBase, route) {
  if (route === "/") return appBase;
  return new URL(route.slice(1), appBase).toString();
}

function withTrailingSlash(value) {
  const url = new URL(value);
  if (!url.pathname.endsWith("/")) url.pathname = `${url.pathname}/`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

function routeFailed(result) {
  if (result.status && result.status >= 400) return true;
  if (result.heading !== result.expectedHeading) return true;
  if (result.pageErrors.length > 0 || result.consoleErrors.length > 0) return true;
  return /\b(404|not found)\b/i.test(result.body);
}
