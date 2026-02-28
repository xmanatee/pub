---
name: pubblue
description: >-
  Publish files or generated content via the pubblue CLI, and run encrypted
  P2P tunnels for live browser communication.
license: MIT
compatibility: Requires Node.js 18+ with npm/pnpm/npx.
metadata:
  author: pub.blue
  version: "3.4.7"
allowed-tools: Bash(pubblue:*) Bash(npx pubblue:*) Bash(node:*) Read Write
---

# pubblue

Use this skill when the user asks about `pubblue`, `pub.blue`, publishing content, or tunnel/canvas chat.

## Required CLI Version

Use **pubblue CLI 0.4.7+**.

```bash
pubblue --version
npm i -g pubblue@0.4.7
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

For continuous two-way tunnel chat without manual polling, use the bridge flow below.
Use manual `pubblue tunnel read` only for debugging.

## Tunnel Quick Flow

1. Start:
```bash
pubblue tunnel start --expires 4h
```

2. Wait for browser:
```bash
pubblue tunnel status
```

3. Send content:
```bash
pubblue tunnel write --tunnel <id> "Hello"
pubblue tunnel write --tunnel <id> -c canvas -f /tmp/view.html
```

4. Read incoming:
```bash
pubblue tunnel read <id> --follow -c chat
```

5. Close:
```bash
pubblue tunnel close <id>
```

Important:
- `tunnel write` uses delivery confirmation; failures should be retried.
- `read` is consumptive. Do not run multiple `read --follow` consumers on the same channel.
- `tunnel start` is idempotent now:
  - Reuses the most recent active tunnel by default
  - Supports `--tunnel <id>` to attach explicitly
  - Use `--new` to force creating a new tunnel

## Bridge Modes (No Manual Polling)

Script: `skills/pubblue/scripts/openclaw-tunnel-bridge.mjs`

Recommended (`openclaw-deliver`):
```bash
OPENCLAW_BRIDGE_MODE="openclaw-deliver" \
node skills/pubblue/scripts/openclaw-tunnel-bridge.mjs --start --expires 7d
```

Attach to existing tunnel:
```bash
OPENCLAW_BRIDGE_MODE="openclaw-deliver" \
node skills/pubblue/scripts/openclaw-tunnel-bridge.mjs --tunnel <id>
```

Fallback (`gateway-reply`):
```bash
OPENCLAW_BRIDGE_MODE="gateway-reply" \
OPENCLAW_GATEWAY_URL="http://127.0.0.1:18789" \
OPENCLAW_GATEWAY_TOKEN="<token-if-needed>" \
node skills/pubblue/scripts/openclaw-tunnel-bridge.mjs --start --expires 7d
```

Behavior:
- One long-lived `pubblue tunnel read --follow -c chat` consumer
- Automatic restart on reader exit
- Dedupe via seen-message state
- Startup preflight:
  - `openclaw-deliver`: verifies OpenClaw executable/command
  - `gateway-reply`: verifies gateway reachability (`/v1/models`)

Useful env:
- `OPENCLAW_SESSION_ID` or `OPENCLAW_THREAD_ID` (strongly recommended for deterministic routing)
- `OPENCLAW_BRIDGE_STATE_DIR` (override bridge lock/state directory)
- `OPENCLAW_DELIVER_CMD`, `OPENCLAW_PATH`
- `OPENCLAW_GATEWAY_TIMEOUT_MS`, `OPENCLAW_MODEL`, `OPENCLAW_AGENT_ID`

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
  - Run bridge script directly and use its preflight output for diagnosis.
