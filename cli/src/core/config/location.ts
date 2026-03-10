import * as fs from "node:fs";
import { homedir } from "node:os";
import * as path from "node:path";
import type { ConfigDirCandidate, ConfigLocation } from "./types.js";

export function trimToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function resolveBaseHome(env: NodeJS.ProcessEnv = process.env): string {
  const envHome = trimToUndefined(env.HOME);
  if (envHome) return path.resolve(envHome);

  const userProfile = trimToUndefined(env.USERPROFILE);
  if (userProfile) return path.resolve(userProfile);

  try {
    return path.resolve(homedir());
  } catch {
    return path.resolve(process.cwd());
  }
}

function expandHomePrefix(input: string, env: NodeJS.ProcessEnv = process.env): string {
  const home = resolveBaseHome(env);
  if (input === "~") return home;
  if (input.startsWith("~/") || input.startsWith("~\\")) {
    return path.join(home, input.slice(2));
  }
  return input;
}

function resolveInputPath(input: string, env: NodeJS.ProcessEnv = process.env): string {
  return path.resolve(expandHomePrefix(input.trim(), env));
}

function pathExists(targetPath: string): boolean {
  return fs.existsSync(targetPath);
}

function describeCandidate(candidate: ConfigDirCandidate): string {
  const status = candidate.exists ? "exists" : "missing";
  return `- ${candidate.dir} (${candidate.source}, ${status})`;
}

function getExplicitConfigDirCandidate(
  env: NodeJS.ProcessEnv = process.env,
): ConfigDirCandidate | null {
  const explicitPub = trimToUndefined(env.PUB_CONFIG_DIR);

  if (!explicitPub) return null;

  const dir = resolveInputPath(explicitPub, env);
  return {
    dir,
    exists: pathExists(dir),
    source: "PUB_CONFIG_DIR",
    description: "configured by PUB_CONFIG_DIR",
  };
}

export function listConfigDirCandidates(
  env: NodeJS.ProcessEnv = process.env,
): ConfigDirCandidate[] {
  const candidates: ConfigDirCandidate[] = [];

  const explicit = getExplicitConfigDirCandidate(env);
  if (explicit) candidates.push(explicit);

  const openclawHome = trimToUndefined(env.OPENCLAW_HOME);
  if (openclawHome) {
    const dir = path.join(resolveInputPath(openclawHome, env), ".openclaw", "pub");
    candidates.push({
      dir,
      exists: pathExists(dir),
      source: "OPENCLAW_HOME",
      description: "derived from OPENCLAW_HOME/.openclaw/pub",
    });
  }

  const homeConfigDir = path.join(resolveBaseHome(env), ".config", "pub");
  candidates.push({
    dir: homeConfigDir,
    exists: pathExists(homeConfigDir),
    source: "HOME_CONFIG",
    description: "derived from ~/.config/pub",
  });

  return candidates;
}

export function resolveConfigLocation(env: NodeJS.ProcessEnv = process.env): ConfigLocation {
  const candidates = listConfigDirCandidates(env);
  const explicit = candidates.find((candidate) => candidate.source === "PUB_CONFIG_DIR");
  if (explicit?.exists) {
    return {
      dir: explicit.dir,
      path: path.join(explicit.dir, "config.json"),
      source: explicit.source,
      description: explicit.description,
    };
  }
  const existing = candidates.filter((candidate) => candidate.exists);

  if (existing.length > 1) {
    throw new Error(
      [
        "Ambiguous Pub config directories detected.",
        "Remove redundant config directories so only one remains.",
        ...existing.map(describeCandidate),
      ].join("\n"),
    );
  }

  if (existing.length === 0) {
    throw new Error(
      [
        "No Pub config directory found.",
        "Create exactly one of these directories and retry:",
        ...candidates.map(describeCandidate),
      ].join("\n"),
    );
  }

  const selected = existing[0];
  return {
    dir: selected.dir,
    path: path.join(selected.dir, "config.json"),
    source: selected.source,
    description: selected.description,
  };
}

export function getConfigDir(env: NodeJS.ProcessEnv = process.env): string {
  return resolveConfigLocation(env).dir;
}

export function getConfigPath(env: NodeJS.ProcessEnv = process.env): string {
  return resolveConfigLocation(env).path;
}
