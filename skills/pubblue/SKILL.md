---
name: pubblue
description: >-
  Publish files or generated content to the web via the pubblue CLI.
  Creates shareable URLs for HTML, CSS, JS, Markdown, and text.
  Use when: publishing content online, sharing files via URL, deploying
  static pages, or the user mentions "pubblue" or "pub.blue".
license: MIT
compatibility: Requires Node.js 16+ with npm/pnpm/npx.
metadata:
  author: pub.blue
  version: "1.1"
allowed-tools: Bash(pubblue:*) Bash(npx pubblue:*) Bash(echo:*) Read Write
---

# pubblue — Instant Content Publishing

Publish files or generated content to the web via the `pubblue` CLI. Each publication gets a unique shareable URL on [pub.blue](https://pub.blue).

## Setup

### 1. Install

```bash
npm i -g pubblue
# Or use without installing: npx pubblue <command>
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
pubblue configure --api-key pub_THEIR_KEY_HERE
```

Or the user can set the `PUBBLUE_API_KEY` environment variable instead.

To use a custom Convex deployment, set the `PUBBLUE_URL` environment variable (defaults to `https://silent-guanaco-514.convex.site`).

## Commands

```bash
# Publish a file
pubblue publish path/to/file.html
pubblue publish --slug my-demo --title "My Demo" page.html

# Manage publications
pubblue list
pubblue get <slug>
pubblue update <slug> --title "New Title" --public
pubblue delete <slug>
```

## Workflow

When the user asks to "publish this", "share this online", or similar:

1. **Check configuration** — run `pubblue list` to verify the CLI is configured. If it fails with "Not configured", follow the Setup steps above to get and save the user's API key.
2. **Generate or gather the content.**
3. **Write content to a temp file** with the right extension (`.html`, `.md`, `.css`, `.js`, `.txt`):
   ```bash
   # Use the Write tool to create the file, then publish it:
   pubblue publish /tmp/my-page.html
   ```
   This avoids shell escaping issues with inline content. Always prefer this over `--content`.
4. **Return the published URL** to the user.

### Why write to file first?

The `publish-content --content '...'` flag exists but breaks on content with quotes, backticks, or `$` signs due to shell escaping. Always use the **Write tool → `pubblue publish <file>`** pattern for reliable publishing.

## Options

| Flag | Description |
|------|-------------|
| `--slug <slug>` | Custom URL slug (auto-generated if omitted) |
| `--title <title>` | Human-readable title |
| `--private` | Hide from public listing |

## Content Types

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
| "Not configured" / "API key not found" | Run `pubblue configure --api-key KEY` or set `PUBBLUE_API_KEY` env var. Get a key from https://pub.blue/dashboard |
| "Slug already taken" | The slug belongs to another user. Use a different `--slug` value |
| "Content exceeds maximum size" | Content must be under 1 MB |
| "File not found" | Check the path; use absolute paths |
| Content appears garbled | Ensure the file extension matches the content type |
