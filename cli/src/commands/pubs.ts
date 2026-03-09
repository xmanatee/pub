import type { Command } from "commander";
import { getTelegramMiniAppUrl } from "../lib/config.js";
import {
  createClient,
  formatVisibility,
  readFile,
  readFromStdin,
  resolveVisibilityFlags,
} from "./shared.js";

export function registerPubCommands(program: Command): void {
  program
    .command("create")
    .description("Create a new pub")
    .argument("[file]", "Path to the file (reads stdin if omitted)")
    .option("--slug <slug>", "Custom slug for the URL")
    .option("--title <title>", "Title for the pub")
    .action(
      async (
        fileArg: string | undefined,
        opts: {
          slug?: string;
          title?: string;
        },
      ) => {
        const client = createClient();

        let content: string | undefined;

        if (fileArg) {
          content = readFile(fileArg);
        } else {
          content = await readFromStdin();
        }

        const result = await client.create({
          content,
          title: opts.title,
          slug: opts.slug,
        });

        console.log(`Created: ${result.url}`);
        const tmaUrl = getTelegramMiniAppUrl(result.slug);
        if (tmaUrl) console.log(`Telegram: ${tmaUrl}`);
      },
    );

  program
    .command("get")
    .description("Get details of a pub")
    .argument("<slug>", "Slug of the pub")
    .option("--content", "Output raw content to stdout (no metadata, pipeable)")
    .action(async (slug: string, opts: { content?: boolean }) => {
      const client = createClient();
      const pub = await client.get(slug);

      if (opts.content) {
        process.stdout.write(pub.content ?? "");
        return;
      }

      console.log(`  Slug:    ${pub.slug}`);
      if (pub.title) console.log(`  Title:   ${pub.title}`);
      console.log(`  Status:  ${formatVisibility(pub.isPublic)}`);
      console.log(`  Created: ${new Date(pub.createdAt).toLocaleDateString()}`);
      console.log(`  Updated: ${new Date(pub.updatedAt).toLocaleDateString()}`);
      if (pub.content) console.log(`  Size:    ${pub.content.length} bytes`);
      if (pub.live) {
        console.log(`  Live: ${pub.live.status}`);
      }
    });

  program
    .command("update")
    .description("Update a pub's content and/or metadata")
    .argument("<slug>", "Slug of the pub to update")
    .option("--file <file>", "New content from file")
    .option("--title <title>", "New title")
    .option("--public", "Make the pub public")
    .option("--private", "Make the pub private")
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
        if (opts.file) {
          content = readFile(opts.file);
        }

        const isPublic = resolveVisibilityFlags({
          public: opts.public,
          private: opts.private,
          commandName: "update",
        });

        const result = await client.update({
          slug,
          content,
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
    .description("List your pubs")
    .action(async () => {
      const client = createClient();
      const pubs = await client.list();
      if (pubs.length === 0) {
        console.log("No pubs.");
        return;
      }

      for (const pub of pubs) {
        const date = new Date(pub.createdAt).toLocaleDateString();
        const sessionLabel = pub.live?.status === "active" ? " [live]" : "";
        console.log(
          `  ${pub.slug}  ${formatVisibility(pub.isPublic)}  ${date}${sessionLabel}`,
        );
      }
    });

  program
    .command("delete")
    .description("Delete a pub")
    .argument("<slug>", "Slug of the pub to delete")
    .action(async (slug: string) => {
      const client = createClient();
      await client.deletePub(slug);
      console.log(`Deleted: ${slug}`);
    });
}
