#!/usr/bin/env node
import { Command } from "commander";
import * as fs from "node:fs";
import * as path from "node:path";
import { PublishApiClient } from "./lib/api.js";
import { getConfig, saveConfig } from "./lib/config.js";

const program = new Command();

program
  .name("publish")
  .description("Publish static content and get shareable URLs")
  .version("0.1.0");

program
  .command("configure")
  .description("Configure the CLI with your API key and server URL")
  .requiredOption("--api-key <key>", "Your API key")
  .requiredOption("--url <url>", "Convex site URL (e.g. https://your-deployment.convex.site)")
  .action((opts: { apiKey: string; url: string }) => {
    saveConfig({ apiKey: opts.apiKey, baseUrl: opts.url });
    console.log("Configuration saved.");
  });

program
  .command("upload")
  .description("Publish a file")
  .argument("<file>", "Path to the file to publish")
  .option("--slug <slug>", "Custom slug for the URL")
  .option("--title <title>", "Title for the publication")
  .option("--private", "Make the publication private")
  .action(
    async (
      file: string,
      opts: { slug?: string; title?: string; private?: boolean },
    ) => {
      const config = getConfig();
      const client = new PublishApiClient(config.baseUrl, config.apiKey);

      const filePath = path.resolve(file);
      if (!fs.existsSync(filePath)) {
        console.error(`File not found: ${filePath}`);
        process.exit(1);
      }

      const content = fs.readFileSync(filePath, "utf-8");
      const filename = path.basename(filePath);

      const result = await client.publish({
        filename,
        content,
        title: opts.title,
        slug: opts.slug,
        isPublic: !opts.private,
      });

      if (result.updated) {
        console.log(`Updated: ${result.url}`);
      } else {
        console.log(`Published: ${result.url}`);
      }
    },
  );

program
  .command("upload-content")
  .description("Publish content directly from stdin or argument")
  .requiredOption("--filename <name>", "Filename (determines content type, e.g. page.html)")
  .option("--content <content>", "Content string (if not provided, reads from stdin)")
  .option("--slug <slug>", "Custom slug for the URL")
  .option("--title <title>", "Title for the publication")
  .option("--private", "Make the publication private")
  .action(
    async (opts: {
      filename: string;
      content?: string;
      slug?: string;
      title?: string;
      private?: boolean;
    }) => {
      const config = getConfig();
      const client = new PublishApiClient(config.baseUrl, config.apiKey);

      let content = opts.content;
      if (!content) {
        // Read from stdin
        const chunks: Buffer[] = [];
        for await (const chunk of process.stdin) {
          chunks.push(chunk as Buffer);
        }
        content = Buffer.concat(chunks).toString("utf-8");
      }

      const result = await client.publish({
        filename: opts.filename,
        content,
        title: opts.title,
        slug: opts.slug,
        isPublic: !opts.private,
      });

      if (result.updated) {
        console.log(`Updated: ${result.url}`);
      } else {
        console.log(`Published: ${result.url}`);
      }
    },
  );

program
  .command("get")
  .description("Get details of a publication")
  .argument("<slug>", "Slug of the publication")
  .action(async (slug: string) => {
    const config = getConfig();
    const client = new PublishApiClient(config.baseUrl, config.apiKey);
    const pub = await client.get(slug);
    const status = pub.isPublic ? "public" : "private";
    console.log(`  Slug:    ${pub.slug}`);
    console.log(`  File:    ${pub.filename}`);
    console.log(`  Type:    ${pub.contentType}`);
    if (pub.title) console.log(`  Title:   ${pub.title}`);
    console.log(`  Status:  ${status}`);
    console.log(`  Created: ${new Date(pub.createdAt).toLocaleDateString()}`);
    console.log(`  Updated: ${new Date(pub.updatedAt).toLocaleDateString()}`);
    console.log(`  Size:    ${pub.content.length} bytes`);
  });

program
  .command("update")
  .description("Update publication metadata")
  .argument("<slug>", "Slug of the publication to update")
  .option("--title <title>", "New title")
  .option("--public", "Make the publication public")
  .option("--private", "Make the publication private")
  .action(
    async (
      slug: string,
      opts: { title?: string; public?: boolean; private?: boolean },
    ) => {
      const config = getConfig();
      const client = new PublishApiClient(config.baseUrl, config.apiKey);

      let isPublic: boolean | undefined;
      if (opts.public) isPublic = true;
      else if (opts.private) isPublic = false;

      const result = await client.update({
        slug,
        title: opts.title,
        isPublic,
      });

      console.log(`Updated: ${result.slug}`);
      if (result.title) console.log(`  Title:  ${result.title}`);
      console.log(`  Status: ${result.isPublic ? "public" : "private"}`);
    },
  );

program
  .command("list")
  .description("List your publications")
  .action(async () => {
    const config = getConfig();
    const client = new PublishApiClient(config.baseUrl, config.apiKey);

    const pubs = await client.list();
    if (pubs.length === 0) {
      console.log("No publications.");
      return;
    }

    for (const pub of pubs) {
      const status = pub.isPublic ? "public" : "private";
      const date = new Date(pub.createdAt).toLocaleDateString();
      console.log(
        `  ${pub.slug}  ${pub.filename}  [${pub.contentType}]  ${status}  ${date}`,
      );
    }
  });

program
  .command("delete")
  .description("Delete a publication")
  .argument("<slug>", "Slug of the publication to delete")
  .action(async (slug: string) => {
    const config = getConfig();
    const client = new PublishApiClient(config.baseUrl, config.apiKey);
    await client.remove(slug);
    console.log(`Deleted: ${slug}`);
  });

program.parse();
