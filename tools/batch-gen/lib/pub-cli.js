import { readFileSync } from "fs";
import { spawnSync } from "child_process";
import { ok, fail as logFail } from "./log.js";

function run(args) {
  const result = spawnSync("pub", args, { encoding: "utf-8", stdio: "pipe" });
  return result.status === 0;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function publishPub(metaFile, htmlFile) {
  const meta = JSON.parse(readFileSync(metaFile, "utf-8"));
  const { slug, title } = meta;
  if (!slug) {
    logFail("no slug in meta.json");
    return { ok: false, slug: null };
  }

  if (run(["create", "--slug", slug, "--title", title, htmlFile])) {
    ok(`published ${slug}`);
    await sleep(6000);
    return { ok: true, slug };
  }

  if (run(["update", slug, "--file", htmlFile])) {
    ok(`updated ${slug} (already existed)`);
    await sleep(6000);
    return { ok: true, slug };
  }

  logFail(`publish failed (${slug})`);
  return { ok: false, slug };
}

export async function updatePub(slug, htmlFile) {
  if (run(["update", slug, "--file", htmlFile])) {
    await sleep(6000);
    return { ok: true };
  }
  return { ok: false };
}
