import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { failCli } from "../errors/cli-error.js";
import { FROZEN_FILES } from "./frozen.js";

const INDEX_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My Pub</title>
  <link rel="stylesheet" href="./style.css">
</head>
<body>
  <div id="app"></div>
  <script type="module" src="./main.js"></script>
</body>
</html>
`;

const MAIN_JS = `import { command, commands } from "./_pub/api.js";

const app = document.getElementById("app");
app.innerHTML = "<h1>Hello from Pub</h1>";
`;

const STYLE_CSS = `*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: system-ui, sans-serif;
  line-height: 1.6;
  color: #1a1a1a;
  background: #fafafa;
}

#app {
  max-width: 800px;
  margin: 2rem auto;
  padding: 0 1rem;
}
`;

const TEMPLATE_FILES: Record<string, string> = {
  "index.html": INDEX_HTML,
  "main.js": MAIN_JS,
  "style.css": STYLE_CSS,
};

function writeFile(path: string, content: string): void {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, content, "utf-8");
}

export function scaffoldProject(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  if (existsSync(join(dir, "index.html"))) {
    failCli(`Directory already contains index.html: ${dir}`);
  }

  for (const [relPath, content] of Object.entries(FROZEN_FILES)) {
    writeFile(join(dir, relPath), content);
  }

  for (const [relPath, content] of Object.entries(TEMPLATE_FILES)) {
    writeFile(join(dir, relPath), content);
  }
}
