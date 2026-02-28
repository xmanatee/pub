#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";
import { createInterface } from "node:readline/promises";
import { Command } from "commander";
import { registerTunnelCommands } from "./commands/tunnel.js";
import { PubApiClient } from "./lib/api.js";
import type { BridgeConfig, SavedConfig } from "./lib/config.js";
import { getConfig, loadConfig, saveConfig } from "./lib/config.js";

const program = new Command();

function createClient(): PubApiClient {
  const config = getConfig();
  return new PubApiClient(config.baseUrl, config.apiKey);
}

async function readFromStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf-8").trim();
}

function formatVisibility(isPublic: boolean): string {
  return isPublic ? "public" : "private";
}

async function readApiKeyFromPrompt(): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    const answer = await rl.question("Enter API key: ");
    return answer.trim();
  } finally {
    rl.close();
  }
}

async function resolveConfigureApiKey(opts: {
  apiKey?: string;
  apiKeyStdin?: boolean;
}): Promise<string> {
  if (opts.apiKey && opts.apiKeyStdin) {
    throw new Error("Use only one of --api-key or --api-key-stdin.");
  }
  if (opts.apiKey) {
    return opts.apiKey.trim();
  }
  if (opts.apiKeyStdin) {
    return readFromStdin();
  }

  const envKey = process.env.PUBBLUE_API_KEY?.trim();
  if (envKey) return envKey;

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(
      "No TTY available. Provide --api-key, --api-key-stdin, or PUBBLUE_API_KEY for configure.",
    );
  }

  return readApiKeyFromPrompt();
}

function collectValues(value: string, previous: string[]): string[] {
  previous.push(value);
  return previous;
}

function parseSetInput(raw: string): { key: string; value: string } {
  const sepIndex = raw.indexOf("=");
  if (sepIndex <= 0 || sepIndex === raw.length - 1) {
    throw new Error(`Invalid --set entry "${raw}". Use key=value.`);
  }
  return {
    key: raw.slice(0, sepIndex).trim(),
    value: raw.slice(sepIndex + 1).trim(),
  };
}

function parseBooleanValue(raw: string, key: string): boolean {
  const normalized = raw.trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on")
    return true;
  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off")
    return false;
  throw new Error(`Invalid boolean value for ${key}: ${raw}`);
}

function parseBridgeModeValue(raw: string): "openclaw" | "none" {
  const normalized = raw.trim().toLowerCase();
  if (normalized === "openclaw" || normalized === "none") return normalized;
  throw new Error(`Invalid bridge mode: ${raw}. Use openclaw or none.`);
}

function parsePositiveInteger(raw: string, key: string): number {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${key} must be a positive integer. Received: ${raw}`);
  }
  return parsed;
}

function applyBridgeSet(bridge: BridgeConfig, key: string, value: string): void {
  switch (key) {
    case "bridge.mode":
      bridge.mode = parseBridgeModeValue(value);
      return;
    case "openclaw.path":
      bridge.openclawPath = value;
      return;
    case "openclaw.sessionId":
      bridge.sessionId = value;
      return;
    case "openclaw.threadId":
      bridge.threadId = value;
      return;
    case "openclaw.deliver":
      bridge.deliver = parseBooleanValue(value, key);
      return;
    case "openclaw.deliverChannel":
      bridge.deliverChannel = value;
      return;
    case "openclaw.replyTo":
      bridge.replyTo = value;
      return;
    case "openclaw.deliverTimeoutMs":
      bridge.deliverTimeoutMs = parsePositiveInteger(value, key);
      return;
    default:
      throw new Error(
        [
          `Unknown config key: ${key}`,
          "Supported keys:",
          "  bridge.mode",
          "  openclaw.path",
          "  openclaw.sessionId",
          "  openclaw.threadId",
          "  openclaw.deliver",
          "  openclaw.deliverChannel",
          "  openclaw.replyTo",
          "  openclaw.deliverTimeoutMs",
        ].join("\n"),
      );
  }
}

function applyBridgeUnset(bridge: BridgeConfig, key: string): void {
  switch (key) {
    case "bridge.mode":
      delete bridge.mode;
      return;
    case "openclaw.path":
      delete bridge.openclawPath;
      return;
    case "openclaw.sessionId":
      delete bridge.sessionId;
      return;
    case "openclaw.threadId":
      delete bridge.threadId;
      return;
    case "openclaw.deliver":
      delete bridge.deliver;
      return;
    case "openclaw.deliverChannel":
      delete bridge.deliverChannel;
      return;
    case "openclaw.replyTo":
      delete bridge.replyTo;
      return;
    case "openclaw.deliverTimeoutMs":
      delete bridge.deliverTimeoutMs;
      return;
    default:
      throw new Error(`Unknown config key for --unset: ${key}`);
  }
}

function hasBridgeValues(bridge: BridgeConfig): boolean {
  return Object.values(bridge).some((value) => value !== undefined);
}

function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 8) return "********";
  return `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`;
}

function printConfigSummary(saved: SavedConfig | null): void {
  if (!saved) {
    console.log("Saved config: none");
    return;
  }

  console.log("Saved config:");
  console.log(`  apiKey: ${maskApiKey(saved.apiKey)}`);
  if (!saved.bridge || !hasBridgeValues(saved.bridge)) {
    console.log("  bridge: none");
    return;
  }

  console.log(`  bridge.mode: ${saved.bridge.mode ?? "(unset)"}`);
  if (saved.bridge.openclawPath) console.log(`  openclaw.path: ${saved.bridge.openclawPath}`);
  if (saved.bridge.sessionId) console.log(`  openclaw.sessionId: ${saved.bridge.sessionId}`);
  if (saved.bridge.threadId) console.log(`  openclaw.threadId: ${saved.bridge.threadId}`);
  if (saved.bridge.deliver !== undefined)
    console.log(`  openclaw.deliver: ${saved.bridge.deliver ? "true" : "false"}`);
  if (saved.bridge.deliverChannel)
    console.log(`  openclaw.deliverChannel: ${saved.bridge.deliverChannel}`);
  if (saved.bridge.replyTo) console.log(`  openclaw.replyTo: ${saved.bridge.replyTo}`);
  if (saved.bridge.deliverTimeoutMs !== undefined)
    console.log(`  openclaw.deliverTimeoutMs: ${saved.bridge.deliverTimeoutMs}`);
}

function resolveVisibilityFlags(opts: {
  public?: boolean;
  private?: boolean;
  commandName: string;
}): boolean | undefined {
  if (opts.public && opts.private) {
    throw new Error(`Use only one of --public or --private for ${opts.commandName}.`);
  }
  if (opts.public) return true;
  if (opts.private) return false;
  return undefined;
}

function readFile(filePath: string): { content: string; basename: string } {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    console.error(`File not found: ${resolved}`);
    process.exit(1);
  }
  return {
    content: fs.readFileSync(resolved, "utf-8"),
    basename: path.basename(resolved),
  };
}

program
  .name("pubblue")
  .description("Publish static content and get shareable URLs")
  .version("0.4.10");

program
  .command("configure")
  .description("Configure the CLI with your API key")
  .option("--api-key <key>", "Your API key (less secure: appears in shell history)")
  .option("--api-key-stdin", "Read API key from stdin")
  .option(
    "--set <key=value>",
    "Set advanced config (repeatable). Example: --set openclaw.sessionId=<id>",
    collectValues,
    [],
  )
  .option("--unset <key>", "Unset advanced config key (repeatable)", collectValues, [])
  .option("--show", "Show saved configuration")
  .action(
    async (opts: {
      apiKey?: string;
      apiKeyStdin?: boolean;
      set: string[];
      unset: string[];
      show?: boolean;
    }) => {
      try {
        const saved = loadConfig();
        const hasApiUpdate = Boolean(opts.apiKey || opts.apiKeyStdin);
        const hasSet = opts.set.length > 0;
        const hasUnset = opts.unset.length > 0;
        const hasMutation = hasApiUpdate || hasSet || hasUnset;

        if (!hasMutation && opts.show) {
          printConfigSummary(saved);
          return;
        }

        let apiKey = saved?.apiKey;
        if (hasApiUpdate || !hasMutation) {
          apiKey = await resolveConfigureApiKey(opts);
        }
        if (!apiKey) {
          const envKey = process.env.PUBBLUE_API_KEY?.trim();
          if (envKey) {
            apiKey = envKey;
          } else {
            throw new Error(
              "No API key available. Provide --api-key/--api-key-stdin (or run plain `pubblue configure` first).",
            );
          }
        }

        const nextBridge: BridgeConfig = { ...(saved?.bridge ?? {}) };
        for (const entry of opts.set) {
          const { key, value } = parseSetInput(entry);
          applyBridgeSet(nextBridge, key, value);
        }
        for (const key of opts.unset) {
          applyBridgeUnset(nextBridge, key.trim());
        }

        const nextConfig: SavedConfig = {
          apiKey,
          bridge: hasBridgeValues(nextBridge) ? nextBridge : undefined,
        };
        saveConfig(nextConfig);
        console.log("Configuration saved.");
        if (opts.show || hasSet || hasUnset) {
          printConfigSummary(nextConfig);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to configure CLI.";
        console.error(message);
        process.exit(1);
      }
    },
  );

program
  .command("create")
  .description("Create a new publication")
  .argument("[file]", "Path to the file (reads stdin if omitted)")
  .option("--slug <slug>", "Custom slug for the URL")
  .option("--title <title>", "Title for the publication")
  .option("--public", "Make the publication public")
  .option("--private", "Make the publication private (default)")
  .option("--expires <duration>", "Auto-delete after duration (e.g. 1h, 24h, 7d)")
  .action(
    async (
      fileArg: string | undefined,
      opts: {
        slug?: string;
        title?: string;
        public?: boolean;
        private?: boolean;
        expires?: string;
      },
    ) => {
      const client = createClient();

      let content: string;
      let filename: string | undefined;

      if (fileArg) {
        const file = readFile(fileArg);
        content = file.content;
        filename = file.basename;
      } else {
        content = await readFromStdin();
      }

      const resolvedVisibility = resolveVisibilityFlags({
        public: opts.public,
        private: opts.private,
        commandName: "create",
      });

      const result = await client.create({
        content,
        filename,
        title: opts.title,
        slug: opts.slug,
        isPublic: resolvedVisibility ?? false,
        expiresIn: opts.expires,
      });

      console.log(`Created: ${result.url}`);
      if (result.expiresAt) {
        console.log(`  Expires: ${new Date(result.expiresAt).toISOString()}`);
      }
    },
  );

program
  .command("get")
  .description("Get details of a publication")
  .argument("<slug>", "Slug of the publication")
  .option("--content", "Output raw content to stdout (no metadata, pipeable)")
  .action(async (slug: string, opts: { content?: boolean }) => {
    const client = createClient();
    const pub = await client.get(slug);

    if (opts.content) {
      process.stdout.write(pub.content);
      return;
    }

    console.log(`  Slug:    ${pub.slug}`);
    console.log(`  Type:    ${pub.contentType}`);
    if (pub.title) console.log(`  Title:   ${pub.title}`);
    console.log(`  Status:  ${formatVisibility(pub.isPublic)}`);
    if (pub.expiresAt) console.log(`  Expires: ${new Date(pub.expiresAt).toISOString()}`);
    console.log(`  Created: ${new Date(pub.createdAt).toLocaleDateString()}`);
    console.log(`  Updated: ${new Date(pub.updatedAt).toLocaleDateString()}`);
    console.log(`  Size:    ${pub.content.length} bytes`);
  });

program
  .command("update")
  .description("Update a publication's content and/or metadata")
  .argument("<slug>", "Slug of the publication to update")
  .option("--file <file>", "New content from file")
  .option("--title <title>", "New title")
  .option("--public", "Make the publication public")
  .option("--private", "Make the publication private")
  .option("--slug <newSlug>", "Rename the slug")
  .action(
    async (
      slug: string,
      opts: {
        file?: string;
        title?: string;
        public?: boolean;
        private?: boolean;
        slug?: string;
      },
    ) => {
      const client = createClient();

      let content: string | undefined;
      let filename: string | undefined;
      if (opts.file) {
        const file = readFile(opts.file);
        content = file.content;
        filename = file.basename;
      }

      const isPublic = resolveVisibilityFlags({
        public: opts.public,
        private: opts.private,
        commandName: "update",
      });

      const result = await client.update({
        slug,
        content,
        filename,
        title: opts.title,
        isPublic,
        newSlug: opts.slug,
      });

      console.log(`Updated: ${result.slug}`);
      if (result.title) console.log(`  Title:  ${result.title}`);
      console.log(`  Status: ${formatVisibility(result.isPublic)}`);
    },
  );

program
  .command("list")
  .description("List your publications")
  .action(async () => {
    const client = createClient();
    const pubs = await client.list();
    if (pubs.length === 0) {
      console.log("No publications.");
      return;
    }

    for (const pub of pubs) {
      const date = new Date(pub.createdAt).toLocaleDateString();
      const expires = pub.expiresAt ? ` expires:${new Date(pub.expiresAt).toISOString()}` : "";
      console.log(
        `  ${pub.slug}  [${pub.contentType}]  ${formatVisibility(pub.isPublic)}  ${date}${expires}`,
      );
    }
  });

program
  .command("delete")
  .description("Delete a publication")
  .argument("<slug>", "Slug of the publication to delete")
  .action(async (slug: string) => {
    const client = createClient();
    await client.remove(slug);
    console.log(`Deleted: ${slug}`);
  });

registerTunnelCommands(program);

program.parse();
