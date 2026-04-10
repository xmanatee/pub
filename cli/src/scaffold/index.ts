import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { DEFAULT_RELAY_URL, type PubTunnelConfig } from "../core/config/types.js";
import { TEMPLATE_FILES } from "./template.js";

const DEFAULT_DEV_PORT = 5173;

export function resolveDefaultTunnelConfig(workspaceRoot: string): {
  tunnelConfig: PubTunnelConfig;
  scaffoldDir: string;
} {
  const scaffoldDir = path.join(workspaceRoot, "default");
  return {
    tunnelConfig: {
      devCommand: "npx vite",
      devCwd: scaffoldDir,
      devPort: DEFAULT_DEV_PORT,
      relayUrl: DEFAULT_RELAY_URL,
    },
    scaffoldDir,
  };
}

export function scaffoldDefaultApp(targetDir: string): void {
  if (fs.existsSync(path.join(targetDir, "package.json"))) {
    return;
  }

  fs.mkdirSync(targetDir, { recursive: true });

  for (const [filePath, content] of Object.entries(TEMPLATE_FILES)) {
    const fullPath = path.join(targetDir, filePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  }

  const packageManager = detectPackageManager();
  execSync(`${packageManager} install`, {
    cwd: targetDir,
    stdio: "inherit",
    timeout: 120_000,
  });
}

function detectPackageManager(): string {
  for (const pm of ["pnpm", "npm"]) {
    try {
      execSync(`${pm} --version`, { stdio: "ignore", timeout: 5_000 });
      return pm;
    } catch {}
  }
  throw new Error("No package manager found. Install pnpm or npm to scaffold the default app.");
}
