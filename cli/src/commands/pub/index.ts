import { statSync } from "node:fs";
import type { Command } from "commander";
import { getTelegramMiniAppUrl } from "../../core/config/index.js";
import { readDirectory, scaffoldProject, validateFrozenFiles } from "../../core/files/index.js";
import {
  createCliCommandContext,
  formatVisibility,
  resolveVisibilityFlags,
} from "../shared/index.js";

function isDirectory(path: string): boolean {
  const stat = statSync(path, { throwIfNoEntry: false });
  return stat?.isDirectory() ?? false;
}

async function readInput(
  fileArg: string | undefined,
  context: ReturnType<typeof createCliCommandContext>,
): Promise<Record<string, string>> {
  if (!fileArg) {
    const content = await context.readStdinText({
      missingMessage: "No content provided. Pass a file/dir or pipe stdin.",
    });
    return { "index.html": content };
  }
  if (isDirectory(fileArg)) {
    const frozen = validateFrozenFiles(fileArg);
    if (!frozen.valid) {
      for (const err of frozen.errors) console.warn(`Warning: ${err}`);
    }
    return readDirectory(fileArg);
  }
  return { "index.html": context.readUtf8File(fileArg) };
}

type CreatePubOptions = {
  slug?: string;
  init?: boolean;
};

type GetPubOptions = {
  content?: boolean;
};

type UpdatePubOptions = {
  file?: string;
  dir?: string;
  public?: boolean;
  private?: boolean;
  slug?: string;
};

export function registerPubCommands(program: Command): void {
  program
    .command("create")
    .description("Create a new pub from a file or directory")
    .argument("[path]", "File or directory path (reads stdin if omitted)")
    .option("--slug <slug>", "Custom slug for the URL")
    .option("--init", "Scaffold a new project directory before creating")
    .action(async (pathArg: string | undefined, opts: CreatePubOptions) => {
      const context = createCliCommandContext();

      if (opts.init) {
        const dir = pathArg ?? ".";
        scaffoldProject(dir);
        console.log(`Scaffolded project in ${dir}`);
        const files = readDirectory(dir);
        const result = await context.getApiClient().create({ files, slug: opts.slug });
        console.log(`Created: ${result.url}`);
        const tmaUrl = getTelegramMiniAppUrl(result.slug, context.env);
        if (tmaUrl) console.log(`Telegram: ${tmaUrl}`);
        return;
      }

      const files = await readInput(pathArg, context);
      const result = await context.getApiClient().create({ files, slug: opts.slug });
      console.log(`Created: ${result.url}`);
      const tmaUrl = getTelegramMiniAppUrl(result.slug, context.env);
      if (tmaUrl) console.log(`Telegram: ${tmaUrl}`);
    });

  program
    .command("get")
    .description("Get details of a pub")
    .argument("<slug>", "Slug of the pub")
    .option("--content", "Output raw index.html to stdout (pipeable)")
    .action(async (slug: string, opts: GetPubOptions) => {
      const context = createCliCommandContext();
      const pub = await context.getApiClient().get(slug);

      if (opts.content) {
        process.stdout.write(pub.files?.["index.html"] ?? "");
        return;
      }

      console.log(`  Slug:    ${pub.slug}`);
      if (pub.title) console.log(`  Title:   ${pub.title}`);
      if (pub.description) console.log(`  Desc:    ${pub.description}`);
      console.log(`  Status:  ${formatVisibility(pub.isPublic)}`);
      console.log(`  Files:   ${pub.fileCount}`);
      console.log(`  Created: ${new Date(pub.createdAt).toLocaleDateString()}`);
      console.log(`  Updated: ${new Date(pub.updatedAt).toLocaleDateString()}`);
      if (pub.live) {
        console.log(`  Live: ${pub.live.status}`);
      }
    });

  program
    .command("update")
    .description("Update a pub's content and/or metadata")
    .argument("<slug>", "Slug of the pub to update")
    .option("--file <file>", "New content from file")
    .option("--dir <dir>", "New content from directory")
    .option("--public", "Make the pub public")
    .option("--private", "Make the pub private")
    .option("--slug <newSlug>", "Rename the slug")
    .action(async (slug: string, opts: UpdatePubOptions) => {
      const context = createCliCommandContext();

      let files: Record<string, string> | undefined;
      if (opts.dir) {
        const frozen = validateFrozenFiles(opts.dir);
        if (!frozen.valid) {
          for (const err of frozen.errors) console.warn(`Warning: ${err}`);
        }
        files = readDirectory(opts.dir);
      } else if (opts.file) {
        files = { "index.html": context.readUtf8File(opts.file) };
      }

      const isPublic = resolveVisibilityFlags({
        public: opts.public,
        private: opts.private,
        commandName: "update",
      });

      if (files === undefined && isPublic === undefined && opts.slug === undefined) {
        throw new Error(
          "Nothing to update. Provide at least one of --file, --dir, --public, --private, or --slug.",
        );
      }

      const result = await context.getApiClient().update({
        slug,
        files,
        isPublic,
        newSlug: opts.slug,
      });

      console.log(`Updated: ${result.slug}`);
      if (result.title) console.log(`  Title:  ${result.title}`);
      if (result.description) console.log(`  Desc:   ${result.description}`);
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
        const fileLabel = pub.fileCount > 1 ? ` (${pub.fileCount} files)` : "";
        console.log(
          `  ${pub.slug}  ${formatVisibility(pub.isPublic)}  ${date}${fileLabel}${sessionLabel}`,
        );
        if (pub.description) {
          console.log(`    ${pub.description}`);
        }
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
