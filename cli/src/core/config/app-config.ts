import * as fs from "node:fs";
import * as path from "node:path";

interface DetectedDevServer {
  devCommand: string;
  devCwd: string;
  devPort: number;
}

export function detectDevServerConfig(dir = process.cwd()): DetectedDevServer | null {
  const pkgPath = path.join(dir, "package.json");
  if (!fs.existsSync(pkgPath)) return null;

  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as {
    scripts?: Record<string, string>;
    devDependencies?: Record<string, string>;
    dependencies?: Record<string, string>;
  };

  const scripts = pkg.scripts ?? {};
  if (!scripts.dev && !scripts.start) return null;

  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
  const command = scripts.dev ? "dev" : "start";
  const port = inferPort(allDeps, scripts);
  const packageManager = detectPackageManager(dir);

  return {
    devCommand: `${packageManager} ${command}`,
    devCwd: path.resolve(dir),
    devPort: port,
  };
}

function inferPort(deps: Record<string, string>, scripts: Record<string, string>): number {
  if (deps.vite || deps["@vitejs/plugin-react"]) return 5173;
  if (deps.next) return 3000;
  if (deps["react-scripts"]) return 3000;
  if (deps.astro) return 4321;
  if (deps.nuxt) return 3000;

  const devScript = scripts.dev ?? scripts.start ?? "";
  const portMatch = devScript.match(/--port\s+(\d+)|-p\s+(\d+)/);
  if (portMatch) return Number.parseInt(portMatch[1] ?? portMatch[2], 10);

  return 3000;
}

function detectPackageManager(dir: string): string {
  if (fs.existsSync(path.join(dir, "bun.lockb")) || fs.existsSync(path.join(dir, "bun.lock"))) {
    return "bun";
  }
  if (fs.existsSync(path.join(dir, "pnpm-lock.yaml"))) return "pnpm";
  if (fs.existsSync(path.join(dir, "yarn.lock"))) return "yarn";
  return "npm run";
}
