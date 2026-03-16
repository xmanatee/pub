import type { Command } from "commander";
import { getTelegramMiniAppUrl } from "../../core/config/index.js";
import {
  createCliCommandContext,
  formatVisibility,
  resolveVisibilityFlags,
} from "../shared/index.js";

interface CreatePubOptions {
  slug?: string;
  title?: string;
  description?: string;
}

interface GetPubOptions {
  content?: boolean;
}

interface UpdatePubOptions {
  file?: string;
  title?: string;
  description?: string;
  public?: boolean;
  private?: boolean;
  slug?: string;
}

export function registerPubCommands(program: Command): void {
  program
    .command("create")
    .description("Create a new pub")
    .argument("[file]", "Path to the file (reads stdin if omitted)")
    .option("--slug <slug>", "Custom slug for the URL")
    .option("--title <title>", "Title for the pub")
    .option("--description <description>", "Short description (max 100 chars)")
    .action(async (fileArg: string | undefined, opts: CreatePubOptions) => {
      const context = createCliCommandContext();

      const content = fileArg
        ? context.readUtf8File(fileArg)
        : await context.readStdinText({
            missingMessage: "No pub content provided. Pass a file or pipe content on stdin.",
          });

      const result = await context.getApiClient().create({
        content,
        title: opts.title,
        description: opts.description,
        slug: opts.slug,
      });

      console.log(`Created: ${result.url}`);
      const tmaUrl = getTelegramMiniAppUrl(result.slug, context.env);
      if (tmaUrl) console.log(`Telegram: ${tmaUrl}`);
    });

  program
    .command("get")
    .description("Get details of a pub")
    .argument("<slug>", "Slug of the pub")
    .option("--content", "Output raw content to stdout (no metadata, pipeable)")
    .action(async (slug: string, opts: GetPubOptions) => {
      const context = createCliCommandContext();
      const pub = await context.getApiClient().get(slug);

      if (opts.content) {
        process.stdout.write(pub.content ?? "");
        return;
      }

      console.log(`  Slug:    ${pub.slug}`);
      if (pub.title) console.log(`  Title:   ${pub.title}`);
      if (pub.description) console.log(`  Desc:    ${pub.description}`);
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
    .option("--description <description>", "Short description (max 100 chars)")
    .option("--public", "Make the pub public")
    .option("--private", "Make the pub private")
    .option("--slug <newSlug>", "Rename the slug")
    .action(async (slug: string, opts: UpdatePubOptions) => {
      const context = createCliCommandContext();
      const content = opts.file ? context.readUtf8File(opts.file) : undefined;

      const isPublic = resolveVisibilityFlags({
        public: opts.public,
        private: opts.private,
        commandName: "update",
      });

      if (
        content === undefined &&
        opts.title === undefined &&
        opts.description === undefined &&
        isPublic === undefined &&
        opts.slug === undefined
      ) {
        throw new Error(
          "Nothing to update. Provide at least one of --file, --title, --description, --public, --private, or --slug.",
        );
      }

      const result = await context.getApiClient().update({
        slug,
        content,
        title: opts.title,
        description: opts.description,
        isPublic,
        newSlug: opts.slug,
      });

      console.log(`Updated: ${result.slug}`);
      if (result.title) console.log(`  Title:  ${result.title}`);
      console.log(`  Status: ${formatVisibility(result.isPublic)}`);
    });

  program
    .command("list")
    .description("List your pubs")
    .action(async () => {
      const context = createCliCommandContext();
      const pubs = await context.getApiClient().list();
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
      const context = createCliCommandContext();
      await context.getApiClient().deletePub(slug);
      console.log(`Deleted: ${slug}`);
    });
}
