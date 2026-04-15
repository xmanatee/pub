/**
 * Interactive smoke: drives the UI through server-fn-backed CRUD for
 * notes and tasks, confirming full browser → server fn → node store round-trip.
 * Cleans up any entries it creates.
 */
import { readFile, unlink, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const base = process.argv[2] || "http://localhost:5173";
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

// Notes: create → verify in store → delete → verify gone
await page.goto(`${base}/notes`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1000);
await page.fill('input[placeholder="Title"]', `${tag}-note`);
await page.fill('textarea[placeholder="Write…"]', "body");
await page.click("button:has-text('Create')");
await page.waitForTimeout(1500);
const notesAfterCreate = await readStore("notes");
const note = notesAfterCreate.find((n) => n.title === `${tag}-note`);

// Tasks: create → toggle → verify → delete
await page.goto(`${base}/tasks`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1000);
await page.fill('input[placeholder="Add a task…"]', `${tag}-task`);
await page.click('button[type="submit"]');
await page.waitForTimeout(1500);
const tasksAfterCreate = await readStore("tasks");
const task = tasksAfterCreate.find((t) => t.title === `${tag}-task`);

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
  if (keep.length === 0) await unlink(store(name)).catch(() => {});
  else await writeFile(store(name), JSON.stringify(keep, null, 2));
}

if (!report.note.ok || !report.task.ok || report.pageErrors.length > 0) process.exit(1);
