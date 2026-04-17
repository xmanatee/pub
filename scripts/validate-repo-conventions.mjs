#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const failures = [];

function fail(message) {
  failures.push(message);
}

function readJson(path) {
  return JSON.parse(readFileSync(join(root, path), "utf8"));
}

function walkFiles(dir, predicate, out = []) {
  for (const entry of readdirSync(join(root, dir))) {
    const path = join(dir, entry);
    const fullPath = join(root, path);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      if (
        entry === "node_modules" ||
        entry === "dist" ||
        entry === ".vinxi" ||
        entry === ".output"
      ) {
        continue;
      }
      walkFiles(path, predicate, out);
    } else if (predicate(path)) {
      out.push(path);
    }
  }
  return out;
}

function validateUiPrimitiveSurface() {
  const allowed = [
    "button.tsx",
    "card.tsx",
    "dropdown-menu.tsx",
    "input.tsx",
    "separator.tsx",
    "switch.tsx",
    "tooltip.tsx",
  ];
  const actual = readdirSync(join(root, "web/src/components/ui"))
    .filter((file) => file.endsWith(".tsx"))
    .sort();
  const expected = [...allowed].sort();

  if (actual.join("\n") !== expected.join("\n")) {
    fail(
      [
        "web/src/components/ui must stay at the locked shadcn primitive surface.",
        `Expected: ${expected.join(", ")}`,
        `Actual: ${actual.join(", ")}`,
      ].join("\n"),
    );
  }
}

function validateSkillProtocol() {
  const cliVersion = readJson("cli/package.json").version;
  const clawVersion = readJson("skills/pub/claw.json").version;
  const skill = readFileSync(join(root, "skills/pub/SKILL.md"), "utf8");
  const skillVersion = skill.match(/^\s*version:\s*"([^"]+)"/m)?.[1];

  if (skillVersion !== clawVersion) {
    fail(
      `skills/pub/SKILL.md version ${
        skillVersion ?? "(missing)"
      } does not match claw.json ${clawVersion}.`,
    );
  }
  if (!skill.includes(`Use **pub CLI ${cliVersion}+**.`)) {
    fail(`skills/pub/SKILL.md Required CLI Version must match cli/package.json (${cliVersion}+).`);
  }
  if (!skill.includes("Bridge-owned chat")) {
    fail("skills/pub/SKILL.md must document bridge-owned chat delivery.");
  }
  if (/pub write\s+"[^"]+"/.test(skill)) {
    fail('skills/pub/SKILL.md must not teach `pub write "..."` for chat messages.');
  }
}

function validateNoArbitraryTailwind() {
  const scannedFiles = [
    ...walkFiles("web/src", (path) => {
      if (!/\.(ts|tsx|css)$/.test(path)) return false;
      if (path.includes("/components/ui/")) return false;
      return !path.endsWith("routeTree.gen.ts");
    }),
    ...walkFiles("packages/super-app/src", (path) => {
      if (!/\.(ts|tsx|css)$/.test(path)) return false;
      return !path.endsWith("routeTree.gen.ts");
    }),
    ...walkFiles("packages/default-app/src", (path) => /\.(ts|tsx|css)$/.test(path)),
    "cli/src/scaffold/template.ts",
  ];

  const arbitraryUtility =
    /(^|[\s"'`])((?:[a-z][\w:/!-]*-)\[[^\]\s"'`]+\]|\[[^\]\s"'`]+\]:[\w:/!-]+)/g;
  const unsupportedZ = /(^|[\s"'`])z-60($|[\s"'`])/g;

  for (const path of scannedFiles) {
    const content = readFileSync(join(root, path), "utf8");
    const lines = content.split("\n");
    lines.forEach((line, index) => {
      if (arbitraryUtility.test(line) || unsupportedZ.test(line)) {
        fail(`${relative(root, join(root, path))}:${index + 1} contains arbitrary Tailwind syntax.`);
      }
      arbitraryUtility.lastIndex = 0;
      unsupportedZ.lastIndex = 0;
    });
  }
}

validateUiPrimitiveSurface();
validateSkillProtocol();
validateNoArbitraryTailwind();

if (failures.length > 0) {
  console.error(failures.join("\n\n"));
  process.exit(1);
}

console.log("OK: repo conventions are complete.");
