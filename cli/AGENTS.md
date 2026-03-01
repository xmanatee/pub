# CLI (pubblue)

## Publishing

- Published to npm as `pubblue` via trusted publishing (OIDC, no token needed)
- CI auto-publishes on push to main **only if** the version in `package.json` differs from npm
- **Always bump `version` in `package.json` when making code changes** — otherwise the new code won't be published

## Reliability

- Prefer explicit errors over silent fallbacks for daemon/bridge startup, signaling, and delivery flows.
