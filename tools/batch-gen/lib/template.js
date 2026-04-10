import { readFileSync } from "node:fs";

export function buildPrompt(templatePath, placeholder, contentPath) {
  const template = readFileSync(templatePath, "utf-8");
  const content = readFileSync(contentPath, "utf-8");
  return template.replace(placeholder, content);
}

export function buildPromptFromString(templatePath, placeholder, content) {
  const template = readFileSync(templatePath, "utf-8");
  return template.replace(placeholder, content);
}
