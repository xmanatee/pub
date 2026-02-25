---
name: pubblue
description: >-
  Publish files or generated content to the web via the pubblue CLI.
  Creates shareable URLs for HTML, CSS, JS, Markdown, and text.
  Use when: publishing content online, sharing files via URL, deploying
  static pages, or the user mentions "pubblue" or "pub.blue".
license: MIT
compatibility: Requires Node.js 18+ with npm/pnpm/npx.
metadata:
  author: pub.blue
  version: "2.0"
allowed-tools: Bash(pubblue:*) Bash(npx pubblue:*) Read Write
---

# pubblue — Instant Content Publishing

Publish files or generated content to the web via the `pubblue` CLI. Each publication gets a unique shareable URL on [pub.blue](https://pub.blue).

## Setup

### 1. Install

```bash
# Preferred — no global install needed:
npx pubblue <command>

# Or install globally:
npm i -g pubblue
```

### 2. Get an API key

The user needs an API key from their pub.blue account:

1. Ask the user to visit **https://pub.blue/dashboard**
2. They sign in with GitHub or Google
3. They click **"Generate API Key"** — the key starts with `pub_` and is shown only once
4. They paste the key back here

### 3. Configure

Once the user provides their API key, save it:

```bash
# Pass directly (appears in shell history):
pubblue configure --api-key pub_THEIR_KEY_HERE

# Pipe via stdin (safer):
echo "pub_THEIR_KEY_HERE" | pubblue configure --api-key-stdin

# Or just run interactively — prompts for the key:
pubblue configure
```

Or the user can set the `PUBBLUE_API_KEY` environment variable instead.

Config is stored at `~/.config/pubblue/config.json`.

To use a custom Convex deployment, set the `PUBBLUE_URL` environment variable (defaults to `https://silent-guanaco-514.convex.site`).

## Commands

```bash
# Create from a file (content type inferred from extension)
pubblue create path/to/file.html
pubblue create --slug my-demo --title "My Demo" --public page.html

# Create from stdin (defaults to text type)
cat page.html | pubblue create
echo "Hello world" | pubblue create --slug greeting

# Get publication details
pubblue get <slug>
pubblue get <slug> --content    # Output raw content (pipeable)

# Update content from file
pubblue update <slug> --file new.html

# Update metadata only
pubblue update <slug> --title "New Title" --public
pubblue update <slug> --private

# List and delete
pubblue list
pubblue delete <slug>
```

## Workflow

When the user asks to "publish this", "share this online", or similar:

1. **Check configuration** — run `pubblue list` to verify the CLI is configured. If it fails with "Not configured. Run `pubblue configure`…", follow the Setup steps above to get and save the user's API key.
2. **Generate or gather the content.**
3. **Write content to a temp file** with the right extension (`.html`, `.md`, `.css`, `.js`, `.txt`):
   ```bash
   # Use the Write tool to create the file, then create a publication:
   pubblue create /tmp/my-page.html
   ```
   The file extension determines the content type (HTML, CSS, JS, Markdown, or text).
4. **Return the published URL** to the user.

### Default visibility

Publications are **private by default**. Use `--public` to make them publicly accessible.

## Options

### create

| Flag | Description |
|------|-------------|
| `[file]` | Positional arg: path to file (reads stdin if omitted) |
| `--slug <slug>` | Custom URL slug (auto-generated if omitted) |
| `--title <title>` | Human-readable title |
| `--public` | Make the publication public (default: private) |
| `--private` | Make the publication private (this is the default) |

### update

| Flag | Description |
|------|-------------|
| `--file <file>` | New content from file |
| `--title <title>` | New title |
| `--public` | Make the publication public |
| `--private` | Make the publication private |

### get

| Flag | Description |
|------|-------------|
| `--content` | Output raw content to stdout (no metadata, pipeable) |

## Content Types

Content type is inferred from the file extension when a file is provided. When reading from stdin, defaults to plain text.

| Extension | Rendered as |
|-----------|-------------|
| `.html`, `.htm` | HTML page |
| `.css` | CSS stylesheet |
| `.js`, `.mjs` | JavaScript |
| `.md`, `.markdown` | Markdown → HTML |
| Everything else | Plain text |

## Limits

- Maximum content size: 1 MB per publication
- Slug format: 1–64 characters, alphanumeric + dots/dashes/underscores, must start with a letter or number

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Not configured. Run `pubblue configure` or set PUBBLUE_API_KEY environment variable." | CLI has no API key. Run `pubblue configure` or set `PUBBLUE_API_KEY` env var. Get a key from https://pub.blue/dashboard |
| "Missing API key" | Request to the server is missing the API key header. Re-run `pubblue configure` |
| "Invalid API key" | The API key was rejected by the server. Generate a new key at https://pub.blue/dashboard |
| "Slug already taken" | Choose a different `--slug` value |
| "Content exceeds maximum size of 1MB" | Content must be under 1 MB |
| "File not found" | Check the path; use absolute paths |
