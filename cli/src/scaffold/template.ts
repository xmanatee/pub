/**
 * Default app template files, embedded as string constants.
 * Keep in sync with packages/default-app/ — verified by template.test.ts.
 */
export const TEMPLATE_FILES: Record<string, string> = {
  "package.json": JSON.stringify(
    {
      name: "pub-app",
      private: true,
      version: "0.0.0",
      type: "module",
      scripts: {
        dev: "vite",
        build: "tsc -b && vite build",
        preview: "vite preview",
      },
      dependencies: {
        react: "^19.0.0",
        "react-dom": "^19.0.0",
      },
      devDependencies: {
        "@types/react": "^19.0.0",
        "@types/react-dom": "^19.0.0",
        "@vitejs/plugin-react": "^4.4.1",
        typescript: "^5.7.2",
        vite: "^6.3.1",
      },
    },
    null,
    2,
  ),

  "index.html": `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Pub App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,

  "src/main.tsx": `import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./App.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
`,

  "src/App.tsx": `import { useState } from "react";

export function App() {
  const [count, setCount] = useState(0);

  return (
    <div className="container">
      <div className="card">
        <h1>Welcome to Pub</h1>
        <p className="subtitle">Your adaptive interface is ready.</p>
        <div className="counter">
          <button type="button" onClick={() => setCount((c) => c + 1)}>
            Count: {count}
          </button>
        </div>
        <p className="hint">Edit <code>src/App.tsx</code> to get started.</p>
      </div>
    </div>
  );
}
`,

  "src/App.css": `*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

:root {
  --bg: #0a0a0a;
  --card-bg: #141414;
  --text: #ededed;
  --text-muted: #888;
  --accent: #3b82f6;
  --accent-hover: #2563eb;
  --border: #262626;
  --radius: 12px;
}

body {
  font-family: system-ui, -apple-system, sans-serif;
  background: var(--bg);
  color: var(--text);
  min-height: 100dvh;
  -webkit-font-smoothing: antialiased;
}

.container {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100dvh;
  padding: 2rem;
}

.card {
  text-align: center;
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 3rem 2.5rem;
  max-width: 420px;
  width: 100%;
}

h1 {
  font-size: 1.75rem;
  font-weight: 600;
  letter-spacing: -0.02em;
  margin-bottom: 0.5rem;
}

.subtitle {
  color: var(--text-muted);
  font-size: 1rem;
  margin-bottom: 2rem;
}

.counter {
  margin-bottom: 2rem;
}

button {
  background: var(--accent);
  color: white;
  border: none;
  border-radius: 8px;
  padding: 0.625rem 1.5rem;
  font-size: 0.9375rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s;
}

button:hover {
  background: var(--accent-hover);
}

button:active {
  transform: scale(0.98);
}

.hint {
  color: var(--text-muted);
  font-size: 0.8125rem;
}

code {
  background: var(--border);
  padding: 0.15em 0.4em;
  border-radius: 4px;
  font-size: 0.85em;
}
`,

  "vite.config.ts": `import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number.parseInt(process.env.PORT || "5173"),
  },
});
`,

  "tsconfig.json": JSON.stringify(
    {
      compilerOptions: {
        target: "ES2020",
        useDefineForClassFields: true,
        lib: ["ES2020", "DOM", "DOM.Iterable"],
        module: "ESNext",
        skipLibCheck: true,
        moduleResolution: "bundler",
        allowImportingTsExtensions: true,
        isolatedModules: true,
        moduleDetection: "force",
        noEmit: true,
        jsx: "react-jsx",
        strict: true,
        noUnusedLocals: true,
        noUnusedParameters: true,
        noFallthroughCasesInSwitch: true,
        noUncheckedSideEffectImports: true,
      },
      include: ["src"],
    },
    null,
    2,
  ),
};
