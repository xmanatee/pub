# CLI (pub)

## Distribution

- Distributed as standalone binaries via GitHub Releases (`curl -fsSL pub.blue/install.sh | bash`)
- Built with `bun build --compile` for macOS (arm64/x64) and Linux (arm64/x64)
- CI builds and uploads binaries on `cli-v*` tags (`.github/workflows/cli-binary.yml`)
- Self-update via `pub upgrade`; version gate blocks CLI if 2+ minor versions behind

## Architecture

- Per-user daemon (not per-slug): `pub start` registers agent presence, daemon polls for incoming live requests
- Browser-initiated live: browser creates WebRTC offer, daemon creates answer
- Supported bridge modes: `openclaw`, `claude-code`, `claude-sdk`, and `openclaw-like` (selected from saved config)
- Verbose daemon logging can be enabled with saved config `bridge.verbose=true`
- `claude-sdk` is only available when `@anthropic-ai/claude-agent-sdk` is locally importable; standalone binary installs otherwise fall back to `claude-code`
- Socket path: `/tmp/pub-agent.sock` (fixed, not slug-dependent)
- Commands that need the active slug (`write`, `doctor`) resolve it via IPC to the daemon
- Daemon spawned via `spawn(process.execPath, [])` with `PUB_DAEMON_MODE=1` env var (binary re-executes itself)
- Product intent: let AI agents generate adaptive interfaces and real-time experiences for users with minimal operator setup.

## Reliability

- Prefer explicit errors over silent fallbacks for daemon/bridge startup, signaling, and delivery flows.
