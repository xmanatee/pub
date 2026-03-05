# CLI (pubblue)

## Publishing

- Published to npm as `pubblue` via trusted publishing (OIDC, no token needed)
- CI auto-publishes on push to main **only if** the version in `package.json` differs from npm
- **Always bump `version` in `package.json` when making code changes** — otherwise the new code won't be published

## Architecture

- Per-user daemon (not per-slug): `pubblue start` registers agent presence, daemon polls for incoming live requests
- Browser-initiated live: browser creates WebRTC offer, daemon creates answer
- Supported bridge modes: `openclaw` and `claude-code` (`pubblue start --bridge <mode>`)
- Socket path: `/tmp/pubblue-agent.sock` (fixed, not slug-dependent)
- Commands that need the active slug (`write`, `read`, `doctor`) resolve it via IPC to the daemon; `channels` queries daemon state directly

## Reliability

- Prefer explicit errors over silent fallbacks for daemon/bridge startup, signaling, and delivery flows.
