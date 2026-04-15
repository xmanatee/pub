import { chromium } from "playwright";

const base = process.argv[2] || "http://localhost:5173";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (err) => errors.push(err.message));
page.on("console", (msg) => { if (msg.type() === "error") errors.push(`[c] ${msg.text().slice(0, 200)}`); });

// Tracker: click "Add" with some text; then confirm it appears.
await page.goto(`${base}/tracker`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);
// Turn off AI so we don't block on the agent; the button has aria-label.
await page.click('button[aria-label="Toggle AI categorization"]');
await page.fill('input[placeholder="What just happened?"]', "hello from playwright");
await page.click("button:has-text('Add')");
await page.waitForTimeout(3000);
const trackerBody = await page.evaluate(() => document.body.innerText).catch(() => "?");
const trackerHasEntry = trackerBody.includes("hello from playwright");

// Files: verify server fn returned real FS listing
await page.goto(`${base}/files`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);
const filesBody = await page.evaluate(() => document.body.innerText).catch(() => "?");
const filesLooksReal = filesBody.includes("Desktop") || filesBody.includes("Documents");

await browser.close();
console.log(JSON.stringify({
  errors: [...new Set(errors)].slice(0, 5),
  trackerHasEntry,
  trackerPreview: trackerBody.replace(/\s+/g, " ").slice(0, 200),
  filesLooksReal,
  filesPreview: filesBody.replace(/\s+/g, " ").slice(0, 200),
}, null, 2));
