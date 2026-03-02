---
name: pubblue
description: >-
  Publish files or generated content via the pubblue CLI, and go live for
  interactive P2P browser communication.
license: MIT
compatibility: Requires Node.js 18+ with npm/pnpm/npx.
metadata:
  author: pub.blue
  version: "4.0.0"
allowed-tools: Bash(pubblue:*) Bash(npx pubblue:*) Bash(node:*) Read Write
---

# pubblue

Use this skill when the user asks about `pubblue`, `pub.blue`, publishing content, or going live/canvas chat.

## Required CLI Version

Use **pubblue CLI 0.5.0+**.

```bash
pubblue --version
npm i -g pubblue@latest
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
- Pubs are **private by default**.
- `create` supports `--public/--private`, `--title`, `--slug`, `--expires`, `--open`.
- `update` supports `--file`, `--title`, `--public/--private`, `--slug`.
- Content is optional — a pub can be interactive-only.

## Going Live (Interactive Flow)

1. Go live (managed bridge enabled by default):
```bash
pubblue open <slug> --agent-name "Oz" --expires 4h
```

Optional explicit bridge selector:
```bash
pubblue open <slug> --agent-name "Oz" --bridge openclaw --expires 4h
pubblue open <slug> --agent-name "Oz" --bridge none --expires 4h
```

`--agent-name` is the display name shown to the browser user (defaults to "Agent" if omitted).

Behavior:
- `open` runs daemon + managed bridge in background, returns after health checks pass.
- `--foreground` keeps process attached to current shell (no managed bridge).
- Reuses existing active live by default; use `--new` to force creation.

2. Wait for browser:
```bash
pubblue status <slug>
```

3. Send content:
```bash
pubblue write --slug <slug> "Hello"
pubblue write --slug <slug> -c canvas -f /tmp/view.html
```

4. Read incoming (manual/debug mode):
```bash
pubblue read <slug> --follow -c chat
```

5. Close:
```bash
pubblue close <slug>
```

6. Validate live end-to-end (strict):
```bash
pubblue doctor --slug <slug>
# optional handshake:
pubblue doctor --slug <slug> --wait-pong --timeout 30
```

Important:
- `write` uses delivery confirmation; failures should be retried.
- `read` is consumptive. Do not run multiple `read --follow` consumers on the same channel.
- `open` is idempotent — reuses existing sessions when possible.

## Bridge Modes

`pubblue open` supports:
- `--bridge openclaw` (default): managed local bridge process (OpenClaw session delivery)
- `--bridge none`: no managed bridge; use manual polling or external integration

Useful env for `openclaw` mode:
- `OPENCLAW_SESSION_ID` or `OPENCLAW_THREAD_ID` (recommended for deterministic routing)
- `OPENCLAW_PATH` (explicit OpenClaw binary/index.js path, if auto-discovery fails)
- `OPENCLAW_DELIVER=1` (optional, enables OpenClaw `--deliver`)
- `OPENCLAW_DELIVER_CHANNEL`, `OPENCLAW_REPLY_TO` (optional channel routing)
- `OPENCLAW_DELIVER_TIMEOUT_MS` (optional dispatch timeout)
- `OPENCLAW_CANVAS_REMINDER_EVERY` (optional, default `10`)

## Telegram Mini App

pub.blue supports Telegram Mini App. When configured, `create` and `open`
automatically output `t.me` deep links. Check `pubblue configure --show` for status.

## Troubleshooting

- `Rate limit exceeded`:
  - Read and respect retry hints.
  - Prefer `open <slug>` (reuse) instead of repeatedly creating new sessions.
- `No browser connected`:
  - Ask user to open pub URL and wait for `status: connected`.
- `Session not found or expired` after open:
  - Check `pubblue status <slug>` and daemon log path from open output.
  - Restart daemon with `pubblue open <slug>`.
- Bridge errors:
  - Use `pubblue status <slug>` and inspect bridge state/log path.
