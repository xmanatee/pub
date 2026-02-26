---
name: pubblue
description: >-
  Publish files or generated content to the web via the pubblue CLI.
  Creates shareable URLs for HTML, Markdown, and text.
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

Publish files or generated content to the web via the `pubblue` CLI. Each publication gets a shareable URL on [pub.blue](https://pub.blue).

## Setup

```bash
# No install needed:
npx pubblue <command>

# Or global:
npm i -g pubblue
```

**API key** — required. The user gets one from [pub.blue/dashboard](https://pub.blue/dashboard) (sign in → "Generate API Key" → starts with `pub_`, shown once).

```bash
pubblue configure --api-key pub_KEY    # or pipe: echo "pub_KEY" | pubblue configure --api-key-stdin
```

Alternatively set `PUBBLUE_API_KEY` env var. Config stored at `~/.config/pubblue/config.json`.

## Commands

```bash
pubblue create page.html                          # from file (type inferred from extension)
pubblue create --slug my-demo --title "Demo" --public page.html
cat page.html | pubblue create                    # from stdin (defaults to text)

pubblue get <slug>                                # details
pubblue get <slug> --content                      # raw content to stdout

pubblue update <slug> --file new.html             # update content
pubblue update <slug> --title "New" --public      # update metadata

pubblue list
pubblue delete <slug>
```

## Workflow

1. **Verify config** — run `pubblue list`. If it fails, follow Setup above.
2. **Generate or gather content.**
3. **Write to a temp file** with the right extension (`.html`, `.md`, `.txt`) using the Write tool, then `pubblue create /tmp/file.html`.
4. **Return the URL** to the user.

### Visibility

Publications are **private by default**. Choose wisely:

- **Public** — accessible to anyone; may appear on [pub.blue/explore](https://pub.blue/explore). Use for content meant to be shared (portfolios, demos, docs, blog posts).
- **Private** — owner-only access. Use for drafts, scratch content, sensitive data, or temporary shares.

Default to private. Ask the user before making something public if intent isn't clear.

### Content efficiency

Publications are single files. Leaner content loads faster and stays within the 1 MB limit.

- **Markdown** is the lightest option — zero client JS, rendered server-side. Great default for text content.
- **Plain HTML + inline `<style>`** is cheap. System fonts, CSS gradients/shadows, and inline SVG are essentially free.
- **CDN libraries** (Bootstrap, React, web fonts) add significant weight. Write only the styles/JS you need unless the user asks for a specific framework.
- **Base64 images** bloat the file — link to hosted URLs instead.

## Options

| Command | Flag | Description |
|---------|------|-------------|
| `create` | `[file]` | Path to file (stdin if omitted) |
| | `--slug <slug>` | Custom URL slug (auto-generated if omitted) |
| | `--title <title>` | Human-readable title |
| | `--public` / `--private` | Visibility (default: private) |
| `update` | `--file <file>` | New content from file |
| | `--title <title>` | New title |
| | `--public` / `--private` | Change visibility |
| `get` | `--content` | Raw content to stdout (pipeable) |

## Content Types

Type is inferred from file extension. Stdin defaults to plain text.

| Extension | Rendered as |
|-----------|-------------|
| `.html`, `.htm` | HTML page |
| `.md`, `.markdown` | Markdown → HTML |
| Everything else | Plain text |

## Limits

- Max content size: 100 KB
- Slug: 1–64 chars, alphanumeric + `.`/`-`/`_`, must start with letter or number

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Not configured…" | Run `pubblue configure` or set `PUBBLUE_API_KEY`. Get key from [dashboard](https://pub.blue/dashboard) |
| "Missing API key" / "Invalid API key" | Re-run `pubblue configure` or generate a new key |
| "Slug already taken" | Choose a different `--slug` |
| "Content exceeds maximum size of 100KB" | Reduce content to under 100 KB |
| "File not found" | Check path; use absolute paths |
