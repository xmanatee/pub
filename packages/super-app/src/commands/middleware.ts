/**
 * Vite plugin: serves the command catalog at `/_pub/cmd/<name>`.
 *
 * `ssrLoadModule` re-evaluates the dispatcher and handler modules whenever
 * their source files change, so editing `manifest.ts` or any handler is picked
 * up on the next call without restarting Vite.
 */
import type { IncomingMessage } from "node:http";
import type { Plugin } from "vite";
import type { dispatch as Dispatch } from "./dispatch";
import type { CommandResponse } from "./types";

const PREFIX = "/_pub/cmd/";
const MAX_BODY_BYTES = 4 * 1024 * 1024;

export function commandsPlugin(): Plugin {
  return {
    name: "pub-commands",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith(PREFIX)) return next();
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end();
          return;
        }
        const name = decodeURIComponent(req.url.slice(PREFIX.length).split("?")[0]);
        let response: CommandResponse;
        try {
          const params = await readJson(req as IncomingMessage);
          const mod = await server.ssrLoadModule("/src/commands/dispatch.ts");
          const dispatch = mod.dispatch as typeof Dispatch;
          response = await dispatch(name, params, {
            loadHandler: (m) => server.ssrLoadModule(`/src/commands/handlers/${m}.ts`),
          });
        } catch (err) {
          response = {
            ok: false,
            error: {
              code: "DISPATCH_FAILURE",
              message: err instanceof Error ? err.message : String(err),
            },
          };
        }
        res.statusCode = response.ok ? 200 : 500;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(response));
      });
    },
  };
}

function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let received = 0;
    req.on("data", (chunk: Buffer) => {
      received += chunk.length;
      if (received > MAX_BODY_BYTES) {
        reject(new Error(`request body exceeds ${MAX_BODY_BYTES} bytes`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("error", reject);
    req.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8").trim();
      if (!text) {
        resolve({});
        return;
      }
      // JSON.parse throws synchronously inside the event handler; wrap to reject.
      try {
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          resolve(parsed);
        } else {
          reject(new Error("body must be a JSON object"));
        }
      } catch (err) {
        reject(err);
      }
    });
  });
}
