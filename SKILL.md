---
name: pubblue
description: Publish static content (HTML, CSS, JS, Markdown, text) to the web and get shareable URLs. Use when the user asks to publish, share, or make content available online.
allowed-tools:
  - Bash
---

# pubblue — Instant Content Publishing

Publish files or generated content to the web via the `pubblue` CLI. Each publication gets a unique shareable URL.

## Install

```bash
pnpm add -g pubblue
```

Or use without installing: `pnpm dlx pubblue <command>`.

## Setup

```bash
pubblue configure --api-key YOUR_API_KEY --url https://YOUR_DEPLOYMENT.convex.site
```

Or set env vars: `PUBBLUE_API_KEY` and `PUBBLUE_URL`.

## Commands

```bash
# Publish a file
pubblue publish path/to/file.html
pubblue publish --slug my-demo --title "My Demo" page.html

# Publish content directly
pubblue publish-content --filename page.html --content '<h1>Hello</h1>'

# Pipe from stdin
echo '<h1>Hello</h1>' | pubblue publish-content --filename page.html

# Manage
pubblue list
pubblue get <slug>
pubblue update <slug> --title "New Title" --public
pubblue delete <slug>
```

## Workflow

When the user asks to "publish this", "share this online", or similar:

1. Generate or gather the content
2. Pick the right extension (`.html`, `.md`, `.css`, `.js`, `.txt`)
3. Use `pubblue publish <file>` for files or `pubblue publish-content --filename <name> --content '...'` for generated content
4. Return the URL to the user

## Options

| Flag | Description |
|------|-------------|
| `--slug <slug>` | Custom URL slug (auto-generated if omitted) |
| `--title <title>` | Human-readable title |
| `--private` | Hide from public listing |
| `--filename <name>` | Filename for content type detection (publish-content only) |
| `--content <text>` | Content string (publish-content only, stdin if omitted) |

## Content types

- `.html` / `.htm` — rendered HTML
- `.css` — CSS
- `.js` / `.mjs` — JavaScript
- `.md` / `.markdown` — Markdown (rendered as HTML)
- Everything else — plain text
