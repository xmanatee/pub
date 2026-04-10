/**
 * Default app template files, embedded as string constants.
 * Keep in sync with packages/default-app/ — verified by template.test.ts.
 */
export const TEMPLATE_FILES: Record<string, string> = {
  "biome.json": JSON.stringify(
    {
      $schema: "https://biomejs.dev/schemas/2.4.3/schema.json",
      formatter: {
        indentStyle: "space",
        indentWidth: 2,
        lineWidth: 100,
      },
      linter: {
        rules: {
          recommended: true,
        },
      },
      assist: {
        actions: {
          source: {
            organizeImports: {
              level: "on",
            },
          },
        },
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

  "package.json": JSON.stringify(
    {
      name: "pub-app",
      private: true,
      version: "0.0.0",
      type: "module",
      scripts: {
        dev: "vite",
        build: "tsc -b && vite build",
        lint: "biome check src",
        format: "biome check --fix src",
      },
      dependencies: {
        react: "^19.0.0",
        "react-dom": "^19.0.0",
      },
      devDependencies: {
        "@biomejs/biome": "^2.4.3",
        "@tailwindcss/vite": "^4.1.0",
        "@types/react": "^19.0.0",
        "@types/react-dom": "^19.0.0",
        "@vitejs/plugin-react": "^4.4.1",
        tailwindcss: "^4.1.0",
        typescript: "^5.7.2",
        vite: "^7.3.1",
      },
    },
    null,
    2,
  ),

  "src/App.tsx": `import { useState } from "react";

export function App() {
  const [count, setCount] = useState(0);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-neutral-950 p-8">
      <div className="w-full max-w-sm rounded-xl border border-neutral-800 bg-neutral-900 p-10 text-center">
        <h1 className="mb-2 text-2xl font-semibold tracking-tight text-neutral-100">
          Welcome to Pub
        </h1>
        <p className="mb-8 text-neutral-400">Your adaptive interface is ready.</p>
        <button
          type="button"
          onClick={() => setCount((c) => c + 1)}
          className="mb-8 rounded-lg bg-blue-500 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-600 active:scale-[0.98]"
        >
          Count: {count}
        </button>
        <p className="text-xs text-neutral-500">
          Edit{" "}
          <code className="rounded bg-neutral-800 px-1.5 py-0.5 text-[0.85em]">src/App.tsx</code>{" "}
          to get started.
        </p>
      </div>
    </div>
  );
}
`,

  "src/index.css": `@import "tailwindcss";
`,

  "src/main.tsx": `import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
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

  "vite.config.ts": `import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss(), react()],
  server: {
    port: Number.parseInt(process.env.PORT || "5173"),
  },
});
`,
};
