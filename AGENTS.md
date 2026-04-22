# Pub

Pub is a full-stack TypeScript system for adaptive interfaces powered by AI
agents. The repo spans a web app, CLI, relay infrastructure, and an embedded
live app experience.

## Operating Principles

- Treat the implementation, configuration schema, package scripts, and focused
  docs as the source of truth for exact commands, protocols, limits, and wiring.
- Keep agent-facing guidance high level here; do not duplicate details that can
  be read directly from code, generated config, or narrower documentation.
- Preserve user-owned workspaces and user-authored content. Initialization and
  upgrades must not silently overwrite local edits.
- Keep live chat, canvas, tunnel, and bridge responsibilities separated. Do not
  route around the owning layer when changing delivery behavior.
- Keep generated, vendored, and primitive UI surfaces read-only unless their
  owning workflow explicitly regenerates or updates them.
- Follow existing routing, state, styling, and data-ownership patterns before
  introducing new abstractions.
- Keep product privacy and cleanup invariants intact when adding creation,
  sharing, connection, or deletion behavior.
- When public CLI or agent-facing behavior changes, keep the shipped runtime
  guidance and metadata in sync with the implementation.

## Architecture Guidelines

- Web, CLI, relay, and live-app code should remain loosely coupled through their
  existing boundaries.
- The CLI owns local setup, validation, daemon lifecycle, bridge coordination,
  and tunnel startup. Keep those concerns explicit and observable.
- The embedded live app is a starting point for user work. Once materialized in
  a workspace, treat it as user-owned source.
- Feature work should be additive where possible and should keep feature-local
  concerns inside the feature boundary.
- Prefer small, verifiable changes that preserve established conventions over
  broad refactors.

## References

Use the focused docs under `docs/` for frontend and testing details.
