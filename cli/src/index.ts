#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";
import { createInterface } from "node:readline/promises";
import { Command } from "commander";
import { PubApiClient } from "./lib/api.js";
import { getConfig, saveConfig } from "./lib/config.js";

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
  .version("0.3.0");

program
  .command("configure")
  .description("Configure the CLI with your API key")
  .option("--api-key <key>", "Your API key (less secure: appears in shell history)")
  .option("--api-key-stdin", "Read API key from stdin")
  .action(async (opts: { apiKey?: string; apiKeyStdin?: boolean }) => {
    try {
      const apiKey = await resolveConfigureApiKey(opts);
      saveConfig({ apiKey });
      console.log("Configuration saved.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to configure CLI.";
      console.error(message);
      process.exit(1);
    }
  });

program
  .command("create")
  .description("Create a new publication")
  .argument("[file]", "Path to the file (reads stdin if omitted)")
  .option("--slug <slug>", "Custom slug for the URL")
  .option("--title <title>", "Title for the publication")
  .option("--public", "Make the publication public (default: private)")
  .option("--private", "Make the publication private (this is the default)")
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

      const result = await client.create({
        content,
        filename,
        title: opts.title,
        slug: opts.slug,
        isPublic: opts.public ?? false,
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

      let isPublic: boolean | undefined;
      if (opts.public) isPublic = true;
      else if (opts.private) isPublic = false;

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

program.parse();
