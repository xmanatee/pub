/**
 * Minimal test "dev server" for tunnel E2E tests.
 * Creates a temp directory with a package.json + server script,
 * designed to be started by the daemon via the tunnel config.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface TestDevServerDir {
  dir: string;
  port: number;
}

export function createTestDevServerDir(port: number): TestDevServerDir {
  const dir = mkdtempSync(join(tmpdir(), "pub-e2e-devserver-"));
  const serverPath = join(dir, "server.js");

  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({
      name: "test-dev-server",
      private: true,
      scripts: { dev: `node ${serverPath}` },
    }),
  );

  writeFileSync(
    serverPath,
    `const http = require("http");
const PORT = process.env.PORT || ${port};
const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(\`<!DOCTYPE html>
<html><head><title>Tunnel Dev Server</title></head>
<body>
  <h1 id="heading">Tunnel Dev Server</h1>
  <div id="status">ok</div>
  <div id="port">\${PORT}</div>
</body></html>\`);
});
server.listen(PORT, () => console.log("listening on " + PORT));
`,
  );

  return { dir, port };
}
