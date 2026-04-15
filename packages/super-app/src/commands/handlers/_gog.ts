import { spawn } from "node:child_process";

const TIMEOUT_MS = 25_000;

/** Run `gog -j ...args` and parse stdout as JSON. Throws on non-zero exit. */
export function gogJson<T>(args: string[]): Promise<T> {
  return new Promise((resolve, reject) => {
    const child = spawn("gog", ["-j", ...args], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("gog timed out"));
    }, TIMEOUT_MS);
    child.stdout.on("data", (b) => {
      stdout += b.toString();
    });
    child.stderr.on("data", (b) => {
      stderr += b.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`gog exit ${code}: ${stderr.trim() || stdout.trim()}`));
        return;
      }
      resolve(stdout.trim() === "" ? ({} as T) : JSON.parse(stdout));
    });
  });
}
