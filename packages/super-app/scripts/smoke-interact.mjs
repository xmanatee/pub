/**
 * Interactive smoke: drives the UI through server-fn-backed CRUD for
 * notes and tasks, confirming full browser → server fn → node store round-trip.
 * Cleans up any entries it creates.
 */
import { readFile, unlink, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const inputBase = process.argv[2] || "http://localhost:5173";
const store = (name) => `${process.env.HOME}/.pub-super-app/${name}.json`;

async function readStore(name) {
  try {
    return JSON.parse(await readFile(store(name), "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
}

const tag = `smoke-${Date.now()}`;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (err) => errors.push(err.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text().slice(0, 200));
});

const appBase = await resolveAppBase(page, inputBase);

// Notes: create -> edit through autosave -> verify the server-backed store.
await gotoRoute(page, appBase, "/notes");
await page.getByRole("button", { name: /^New$/ }).click();
await page.getByPlaceholder("Title").fill(`${tag}-note`);
await page.getByPlaceholder(/^Write/).fill("body");
const note = await waitForStoreEntry("notes", (n) => n.title === `${tag}-note` && n.body === "body");

// Tasks: create through the current command input -> verify the server-backed store.
await gotoRoute(page, appBase, "/tasks");
await page.getByPlaceholder(/^What needs to be done/).fill(`${tag}-task`);
await page.locator('form button[type="submit"]').click();
const task = await waitForStoreEntry("tasks", (t) => t.title === `${tag}-task`);

await browser.close();

const report = {
  pageErrors: [...new Set(errors)].slice(0, 3),
  note: note
    ? { ok: true, id: note.id, body: note.body, hasCreatedAt: !!note.createdAt }
    : { ok: false },
  task: task
    ? { ok: true, id: task.id, completed: task.completed, hasCreatedAt: !!task.createdAt }
    : { ok: false },
};
console.log(JSON.stringify(report, null, 2));

// Clean up anything the smoke created so repeat runs stay idempotent.
await cleanup("notes", (n) => n.title === `${tag}-note`);
await cleanup("tasks", (t) => t.title === `${tag}-task`);

async function cleanup(name, matcher) {
  const contents = await readStore(name);
  const keep = contents.filter((e) => !matcher(e));
  if (keep.length === 0) {
    try {
      await unlink(store(name));
    } catch (error) {
      console.warn(`Failed to remove empty ${name} store`, error);
    }
  } else {
    await writeFile(store(name), JSON.stringify(keep, null, 2));
  }
}

if (!report.note.ok || !report.task.ok || report.pageErrors.length > 0) process.exit(1);

async function resolveAppBase(page, base) {
  await page.goto(base, { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
  return withTrailingSlash(page.url());
}

async function gotoRoute(page, appBase, route) {
  await page.goto(routeUrl(appBase, route), { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
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

async function waitForStoreEntry(name, matcher) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const entry = (await readStore(name)).find(matcher);
    if (entry) return entry;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return null;
}
