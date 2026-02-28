import type { Command } from "commander";
import {
  createClient,
  formatVisibility,
  readFile,
  readFromStdin,
  resolveVisibilityFlags,
} from "./shared.js";

export function registerPublicationCommands(program: Command): void {
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
}
