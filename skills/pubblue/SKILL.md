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
  version: "1.0"
allowed-tools: Bash(pubblue:*) Bash(npx pubblue:*) Bash(echo:*) Read Write
---

# pubblue — Instant Content Publishing

Publish files or generated content to the web via the `pubblue` CLI. Each publication gets a unique shareable URL on [pub.blue](https://pub.blue).

## Setup

```bash
# Install globally
npm i -g pubblue

# Or use without installing
npx pubblue <command>

# Configure (one-time)
pubblue configure --api-key YOUR_API_KEY --url https://YOUR_DEPLOYMENT.convex.site
```

Or set env vars: `PUBBLUE_API_KEY` and `PUBBLUE_URL`.

## Commands

```bash
# Publish a file
pubblue publish path/to/file.html
pubblue publish --slug my-demo --title "My Demo" page.html

# Publish content directly (useful for generated content)
pubblue publish-content --filename page.html --content '<h1>Hello</h1>'

# Pipe from stdin
echo '<h1>Hello</h1>' | pubblue publish-content --filename page.html

# Manage publications
pubblue list
pubblue get <slug>
pubblue update <slug> --title "New Title" --public
pubblue delete <slug>
```

## Workflow

When the user asks to "publish this", "share this online", or similar:

1. If not configured, run `pubblue configure` first
2. Generate or gather the content
3. Pick the right extension (`.html`, `.md`, `.css`, `.js`, `.txt`)
4. Use `pubblue publish <file>` for files or `pubblue publish-content --filename <name> --content '...'` for generated content
5. Return the published URL to the user

## Options

| Flag | Description |
|------|-------------|
| `--slug <slug>` | Custom URL slug (auto-generated if omitted) |
| `--title <title>` | Human-readable title |
| `--private` | Hide from public listing |
| `--filename <name>` | Filename for content type detection (publish-content only) |
| `--content <text>` | Content string (publish-content only; reads stdin if omitted) |

## Content Types

| Extension | Rendered as |
|-----------|-------------|
| `.html`, `.htm` | HTML page |
| `.css` | CSS stylesheet |
| `.js`, `.mjs` | JavaScript |
| `.md`, `.markdown` | Markdown → HTML |
| Everything else | Plain text |

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "API key not found" | Run `pubblue configure` or set `PUBBLUE_API_KEY` env var |
| "Slug already exists" | Use a different `--slug` value, or `pubblue update <slug>` |
| "File not found" | Check the path exists; use absolute paths if needed |
