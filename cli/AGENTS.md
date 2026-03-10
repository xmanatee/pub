# CLI (pubblue)

## Distribution

- Distributed as standalone binaries via GitHub Releases (`curl -fsSL pub.blue/install.sh | bash`)
- Built with `bun build --compile` for macOS (arm64/x64) and Linux (arm64/x64)
- CI builds and uploads binaries on `cli-v*` tags (`.github/workflows/cli-binary.yml`)
- Self-update via `pubblue upgrade`; version gate blocks CLI if 2+ minor versions behind

## Architecture

- Per-user daemon (not per-slug): `pubblue start` registers agent presence, daemon polls for incoming live requests
- Browser-initiated live: browser creates WebRTC offer, daemon creates answer
- Supported bridge modes: `openclaw`, `claude-code`, and `claude-sdk` (`pubblue start --bridge <mode>`)
- Socket path: `/tmp/pubblue-agent.sock` (fixed, not slug-dependent)
- Commands that need the active slug (`write`, `read`, `doctor`) resolve it via IPC to the daemon; `channels` queries daemon state directly
- Daemon spawned via `spawn(process.execPath, [])` with `PUBBLUE_DAEMON_MODE=1` env var (binary re-executes itself)
- Product intent: let AI agents publish content and drive live browser visualizations with minimal operator setup.

## Reliability

- Prefer explicit errors over silent fallbacks for daemon/bridge startup, signaling, and delivery flows.
