---
name: pubblue
description: >-
  Publish files or generated content to the web via the pubblue CLI.
  Creates shareable URLs for HTML, Markdown, and text. Start encrypted
  P2P tunnels for live agent-to-browser communication.
  Use when: publishing content online, sharing files via URL, deploying
  static pages, starting a tunnel for browser communication,
  or the user mentions "pubblue" or "pub.blue".
license: MIT
compatibility: Requires Node.js 18+ with npm/pnpm/npx.
metadata:
  author: pub.blue
  version: "3.4.2"
allowed-tools: Bash(pubblue:*) Bash(npx pubblue:*) Bash(node:*) Read Write
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

### Required CLI Version

Use **pubblue CLI 0.4.4 or newer**. Older versions have tunnel reliability differences.

```bash
pubblue --version
npm i -g pubblue@0.4.4
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
| | `--expires <duration>` | Optional auto-delete duration (e.g. `1h`, `24h`, `7d`) |
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

## Tunnel — P2P Bridge to Browser

Start an encrypted P2P WebRTC tunnel so users can communicate with you through their browser. All data flows directly between your daemon and the user's browser — pub.blue only handles the initial connection setup.

### When to Use

- User wants to interact with you via a web UI instead of the terminal
- You need to present rich HTML content (dashboards, charts, interactive pages)
- User wants a live browser session tied to their own account
- Real-time back-and-forth with audio, images, or files

### Tunnel Workflow

1. **Start a tunnel:**
   ```bash
   pubblue tunnel start --expires 4h
   ```
   Prints a URL (e.g., `https://pub.blue/t/abc123`) and tunnel ID.
   Owner-auth mode: open it while signed into the same pub.blue account that created the tunnel.

2. **Wait for connection:**
   ```bash
   pubblue tunnel status
   ```
   Shows `connected` once the user opens the URL.

3. **Communicate via channels:**
   ```bash
   # Send a text message (default channel: chat)
   pubblue tunnel write --tunnel <id> "Here are the results..."

   # Present HTML in the canvas panel
   pubblue tunnel write --tunnel <id> -c canvas -f /tmp/dashboard.html

   # Send a file
   pubblue tunnel write --tunnel <id> -c file -f /tmp/report.pdf

   # Read incoming messages (returns JSON array)
   pubblue tunnel read <id>

   # Stream messages continuously
   pubblue tunnel read <id> --follow
   ```
   `tunnel write` now waits for delivery confirmation from the browser. If delivery is not confirmed, it fails so you can retry.

4. **Stream user messages continuously:**
   After sending content or a message, start a continuous reader:
   ```bash
   pubblue tunnel read <id> --follow -c chat
   ```
   - Keep it running while the conversation is active
   - It automatically retries if the local daemon restarts
   - `read` consumes buffered messages; avoid running a second `pubblue tunnel read` in parallel for the same channel
   - If you need files/screenshots, use a separate read on `-c file` only when needed
   - IMPORTANT: You will NOT be notified automatically unless you are actively reading (`--follow` or manual polling).

5. **Close when done:**
   ```bash
   pubblue tunnel close <id>
   ```

### Channels

Data flows through named channels. Default channels:

| Channel | Purpose |
|---------|---------|
| `chat` | Text messages (default for `write`/`read`) |
| `canvas` | HTML content displayed in a side panel |
| `audio` | Audio streams |
| `media` | Images, screenshots, camera frames |
| `file` | File transfers |

You can use any custom channel name with `-c <name>`.

### Tips

- **Canvas updates**: just write again to the `canvas` channel — the connection stays open.
- **Auto-detect tunnel**: if only one tunnel is active, tunnel id can be omitted from `write` (no `--tunnel`), `read`, `status`, and `channels`.
- **Multiple tunnels**: `pubblue tunnel list` shows all active tunnels.
- **Foreground mode**: `pubblue tunnel start --foreground` runs the daemon in your terminal (useful for debugging).

### Tunnel Limits

- Max 5 active tunnels per user
- Max expiry: 7 days (default: 24 hours). There is no infinite tunnel TTL; long-lived setups must recreate tunnels.
- Requires `node-datachannel` native module (bundled with pubblue)
- Tunnel access is owner-authenticated (not a public bearer link yet)

## OpenClaw Direct Bridge Mode (No Manual Polling)

Use this mode when tunnel chat must be wired directly to OpenClaw, without the main process manually polling every turn.

### What this does

- Starts or attaches to a pubblue tunnel daemon
- Runs one long-lived `read --follow` consumer
- For each incoming tunnel chat message, forwards it to OpenClaw
- Wraps incoming text with explicit `pubblue tunnel write --tunnel <id> ...` reply instructions
- Supports two bridge modes:
  - `openclaw-deliver` (recommended): uses local `openclaw agent --local --deliver` injection
  - `gateway-reply` (fallback): uses gateway `/v1/chat/completions` and writes reply back directly

### Why `openclaw-deliver` is preferred

This mirrors the proven pattern used in `agent-chat`: local OpenClaw delivery avoids fragile gateway auth/pairing loops and injects into a real OpenClaw session.

### Prerequisites

1. `pubblue >= 0.4.4`
2. OpenClaw installed (for `openclaw-deliver`) or gateway Chat Completions enabled (for `gateway-reply`)
3. Exactly one `read --follow` consumer per tunnel/chat channel
4. For `openclaw-deliver`, ensure the OpenClaw session can execute `pubblue` commands

### Run (recommended: openclaw-deliver)

```bash
# Start tunnel + long-lived bridge
OPENCLAW_BRIDGE_MODE="openclaw-deliver" \
node skills/pubblue/scripts/openclaw-tunnel-bridge.mjs --start --expires 7d

# Or attach to existing tunnel
OPENCLAW_BRIDGE_MODE="openclaw-deliver" \
node skills/pubblue/scripts/openclaw-tunnel-bridge.mjs --tunnel <id>
```

Optional env for `openclaw-deliver`:

- `OPENCLAW_DELIVER_CMD` — custom command receiving `AGENT_MSG` + `AGENT_TUNNEL_ID`
- `OPENCLAW_PATH` — explicit OpenClaw binary/index.js path
- `OPENCLAW_SESSION_ID` — explicit session UUID
- `OPENCLAW_THREAD_ID` — resolve `agent:main:main:thread:<id>` from sessions file
- `OPENCLAW_DELIVER_CHANNEL` / `OPENCLAW_REPLY_TO` — delivery routing

### Run (fallback: gateway-reply)

```bash
OPENCLAW_BRIDGE_MODE="gateway-reply" \
OPENCLAW_GATEWAY_URL="http://127.0.0.1:18789" \
OPENCLAW_GATEWAY_TOKEN="<token-if-needed>" \
OPENCLAW_MODEL="openclaw:main" \
node skills/pubblue/scripts/openclaw-tunnel-bridge.mjs --start --expires 7d
```

Optional env for `gateway-reply`:

- `OPENCLAW_AGENT_ID` — set `x-openclaw-agent-id`
- `OPENCLAW_SESSION_KEY` — session key (default: `pubblue:tunnel:<id>`)
- `OPENCLAW_GATEWAY_TIMEOUT_MS` — request timeout for gateway calls (default: `30000`)

### Operational rules

- Run exactly one `pubblue tunnel read --follow` consumer per channel/tunnel pair
- Keep bridge process alive with a supervisor (`tmux`, `screen`, system service, or container manager)
- Do not run competing `read` commands on `chat`; reads are consumptive
- Treat failed `tunnel write` as undelivered and retry after reconnect (gateway mode)

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Not configured…" | Run `pubblue configure` or set `PUBBLUE_API_KEY`. Get key from [dashboard](https://pub.blue/dashboard) |
| "Missing API key" / "Invalid API key" | Re-run `pubblue configure` or generate a new key |
| "Slug already taken" | Choose a different `--slug` |
| "Content exceeds maximum size of 100KB" | Reduce content to under 100 KB |
| "File not found" | Check path; use absolute paths |
| `No browser connected` on `tunnel write` | Ask user to open tunnel URL first, wait for `pubblue tunnel status` = `connected`, retry |
| `pairing required` / gateway auth failures in OpenClaw bridge | Use token/password auth for local bridge calls, or route via trusted proxy with required headers |
| Bridge forwards to OpenClaw but tunnel gets no reply | In `openclaw-deliver`, ensure OpenClaw session has pubblue skill + command access, or switch to `OPENCLAW_BRIDGE_MODE=gateway-reply` |
