---
name: pub
description: >-
  Publish and visualize output via the pub CLI, with live P2P browser sessions.
license: MIT
compatibility: Standalone binary for macOS and Linux (arm64/x64).
metadata:
  author: pub.blue
  version: "5.2.2"
allowed-tools: Bash(pub:*) Bash(node:*) Read Write
---

# pub

Use this skill when the user asks about publishing, showing, or visualizing agent output on pub.blue.

## Required CLI Version

Use **pub CLI 0.7.2+**.

```bash
pub --version
# Install or update:
curl -fsSL https://pub.blue/install.sh | bash
# Or self-update:
pub upgrade
```

## Setup

```bash
# One-time auth
pub config --api-key pub_KEY
# or
echo "pub_KEY" | pub config --api-key-stdin
```

Key source: <https://pub.blue/dashboard>

Pub resolves config from exactly one existing directory:
- `PUB_CONFIG_DIR`
- `OPENCLAW_HOME/.openclaw/pub`
- `~/.config/pub`

If more than one exists, Pub fails until redundant config directories are removed.
For OpenClaw bridge mode, set an explicit workspace before `pub config --auto`, for example `OPENCLAW_WORKSPACE=/absolute/path/to/workspace`.

## Core Commands

```bash
pub create page.html
pub create --slug demo --title "Demo" page.html
cat page.html | pub create

pub get <slug>
pub get <slug> --content

pub update <slug> --file next.html
pub update <slug> --title "New title" --public

pub list
pub delete <slug>
```

Notes:
- Pub is built for agent-driven output sharing and live visualization.
- Pubs are **private by default**.
- **Reuse existing pubs** for regular or repeated tasks. Use `pub list` to check if a relevant pub already exists, then `pub update <slug>` instead of creating a new one. Each user is limited to 10 pubs.
- `create` supports `--title`, `--slug`.
- `update` supports `--file`, `--title`, `--public/--private`, `--slug`.
- Content is optional: a pub can be live-only.

## Going Live

Live is browser-initiated: the user opens the pub page; owner live mode connects automatically once the daemon is online.

1. Start the agent daemon:
```bash
pub start --agent-name "<agent-name>"
```

Notes:
- Bridge mode comes from saved config (`pub config --auto` or `pub config --set bridge.mode=...`).
- Standalone binary installs fall back to `claude-code` when the Claude Agent SDK package is not locally importable.
- `bridge.mode=claude-sdk` requires `@anthropic-ai/claude-agent-sdk` to be available in the local JS environment.

2. Check runtime status:
```bash
pub status
```

3. Send replies:
```bash
pub write "Hello"
pub write -c canvas -f /tmp/view.html
```

4. Read incoming (manual/debug):
```bash
pub read --follow -c chat
pub read --all
```

5. Stop daemon:
```bash
pub stop
```

6. Validate end-to-end:
```bash
pub doctor
pub doctor --wait-pong --timeout 30
pub doctor --skip-chat --skip-canvas
```

Important:
- `write` waits for delivery confirmation.
- `read` is consumptive; avoid multiple `read --follow` consumers on the same channel.

## Advanced Details (On Demand)

Only when needed:
- Show effective saved config: `pub config`
- Inspect runtime and bridge state: `pub status`
- See command-specific options: `pub <command> --help`
