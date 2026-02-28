---
name: pubblue
description: >-
  Publish files or generated content via the pubblue CLI, and run encrypted
  P2P tunnels for live browser communication.
license: MIT
compatibility: Requires Node.js 18+ with npm/pnpm/npx.
metadata:
  author: pub.blue
  version: "3.4.11"
allowed-tools: Bash(pubblue:*) Bash(npx pubblue:*) Bash(node:*) Read Write
---

# pubblue

Use this skill when the user asks about `pubblue`, `pub.blue`, publishing content, or tunnel/canvas chat.

## Required CLI Version

Use **pubblue CLI 0.4.11+**.

```bash
pubblue --version
npm i -g pubblue@0.4.11
```

## Setup

```bash
# One-time auth
pubblue configure --api-key pub_KEY
# or
echo "pub_KEY" | pubblue configure --api-key-stdin
```

Key source: <https://pub.blue/dashboard>
Config path: `~/.config/pubblue/config.json`
Env override: `PUBBLUE_API_KEY`

Optional OpenClaw bridge config (saved in CLI config):
```bash
pubblue configure --set bridge.mode=openclaw
pubblue configure --set openclaw.path=/app/dist/index.js
pubblue configure --set openclaw.sessionId=<session-id>
# or:
pubblue configure --set openclaw.threadId=<thread-id>
pubblue configure --set openclaw.canvasReminderEvery=10
pubblue configure --show
```

## Core Publish Commands

```bash
pubblue create page.html
pubblue create --slug demo --title "Demo" --public page.html
cat notes.md | pubblue create

pubblue get <slug>
pubblue get <slug> --content

pubblue update <slug> --file next.html
pubblue update <slug> --title "New title" --public

pubblue list
pubblue delete <slug>
```

Notes:
- Publications are **private by default**.
- `create` supports `--public/--private`, `--title`, `--slug`, `--expires`.
- `update` supports `--file`, `--title`, `--public/--private`, `--slug`.

## OpenClaw Default Flow (Recommended)

`pubblue tunnel start` now owns bridge setup by default.
- Default bridge mode: `openclaw`
- To disable managed bridge (manual mode): `--bridge none`

## Tunnel Quick Flow

1. Start (managed bridge enabled by default):
```bash
pubblue tunnel start --expires 4h
```

Optional explicit bridge selector:
```bash
pubblue tunnel start --bridge openclaw --expires 4h
pubblue tunnel start --bridge none --expires 4h
```

Behavior:
- Default `tunnel start` runs daemon + managed bridge in background, but only returns after health checks pass.
- `--foreground` keeps process attached to current shell and does not run managed bridge.

2. Wait for browser:
```bash
pubblue tunnel status
```

3. Send content:
```bash
pubblue tunnel write --tunnel <id> "Hello"
pubblue tunnel write --tunnel <id> -c canvas -f /tmp/view.html
```

4. Read incoming (manual/debug mode):
```bash
pubblue tunnel read <id> --follow -c chat
```

5. Close:
```bash
pubblue tunnel close <id>
```

6. Validate tunnel end-to-end (strict):
```bash
pubblue tunnel doctor --tunnel <id>
# optional handshake:
pubblue tunnel doctor --tunnel <id> --wait-pong --timeout 30
```

Important:
- `tunnel write` uses delivery confirmation; failures should be retried.
- `read` is consumptive. Do not run multiple `read --follow` consumers on the same channel.
- `tunnel start` is idempotent now:
  - Reuses the most recent active tunnel by default
  - Supports `--tunnel <id>` to attach explicitly
  - Use `--new` to force creating a new tunnel

## Bridge Modes

`pubblue tunnel start` supports:
- `--bridge openclaw` (default): managed local bridge process (OpenClaw session delivery)
- `--bridge none`: no managed bridge; use manual polling or external integration

Useful env for `openclaw` mode:
- `OPENCLAW_SESSION_ID` or `OPENCLAW_THREAD_ID` (recommended for deterministic routing)
- `OPENCLAW_PATH` (explicit OpenClaw binary/index.js path, if auto-discovery fails)
- `OPENCLAW_DELIVER=1` (optional, enables OpenClaw `--deliver`)
- `OPENCLAW_DELIVER_CHANNEL`, `OPENCLAW_REPLY_TO` (optional channel routing)
- `OPENCLAW_DELIVER_TIMEOUT_MS` (optional dispatch timeout)
- `OPENCLAW_CANVAS_REMINDER_EVERY` (optional, default `10`)

## Troubleshooting

- `Rate limit exceeded`:
  - Read and respect retry hints.
  - Prefer `tunnel start --tunnel <id>` / reuse instead of repeatedly creating new tunnels.
- `No browser connected`:
  - Ask user to open tunnel URL and wait for `status: connected`.
- `Tunnel not found or expired` after start:
  - Check `pubblue tunnel status` and daemon log path from start output.
  - Restart daemon against existing tunnel with `pubblue tunnel start --tunnel <id>`.
- Bridge errors:
  - Use `pubblue tunnel status` and inspect bridge state/log path.
