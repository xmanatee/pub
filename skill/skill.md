# Publish — Instant Content Publishing Skill

Use this skill when the user asks you to publish, share, or make content available online. This includes HTML pages, CSS stylesheets, JavaScript files, Markdown documents, or plain text.

## Prerequisites

The `publish` CLI must be installed and configured:

```bash
# Install (from GitHub releases)
npm install -g @xmanatee/publish-cli

# Configure with API key and Convex site URL
publish configure --api-key YOUR_API_KEY --url https://YOUR_DEPLOYMENT.convex.site
```

Alternatively, set environment variables:
```bash
export PUBLISH_API_KEY=pub_your_key_here
export PUBLISH_URL=https://your-deployment.convex.site
```

## Usage

### Publish a file from disk
```bash
publish upload path/to/file.html
publish upload --slug my-demo --title "My Demo" page.html
```

### Publish content directly (useful for agent-generated content)
```bash
publish upload-content --filename page.html --content '<html><body><h1>Hello</h1></body></html>'
```

### Publish from stdin
```bash
echo '<h1>Hello</h1>' | publish upload-content --filename page.html
```

### List publications
```bash
publish list
```

### Delete a publication
```bash
publish delete <slug>
```

## Workflow for AI Agents

When the user asks to "publish this", "share this online", "make this visible", or similar:

1. Generate or gather the content to publish
2. Determine the appropriate filename extension (`.html`, `.md`, `.css`, `.js`, `.txt`)
3. Use `publish upload` for files or `publish upload-content` for generated content
4. Return the URL to the user

### Content type inference
- `.html`, `.htm` → HTML (rendered in browser)
- `.css` → CSS
- `.js`, `.mjs` → JavaScript
- `.md`, `.markdown` → Markdown (rendered as HTML)
- Everything else → Plain text

### Example: Publishing a quick HTML page
```bash
publish upload-content \
  --filename demo.html \
  --title "Quick Demo" \
  --content '<!DOCTYPE html><html><head><title>Demo</title></head><body><h1>It works!</h1></body></html>'
```

### Example: Publishing a Markdown document
```bash
publish upload-content \
  --filename notes.md \
  --title "Meeting Notes" \
  --slug meeting-2025-01-15 \
  --content '# Meeting Notes\n\n- Item 1\n- Item 2'
```

## Options

| Flag | Description |
|------|-------------|
| `--slug <slug>` | Custom URL slug (auto-generated if omitted) |
| `--title <title>` | Human-readable title |
| `--private` | Hide from public listing |
| `--filename <name>` | Filename for content type detection (upload-content only) |
| `--content <text>` | Content string (upload-content only, stdin if omitted) |
