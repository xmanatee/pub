# Phase 10: Live Library Relocation

## Objective

Move live-specific protocol and WebRTC internals under live feature ownership.

## Scope

- `bridge-protocol`, `webrtc-browser`, `webrtc-channel`, `ack-routing` and related tests.

## Tasks

1. Move live-specific infrastructure modules to `src/features/live/lib/*`.
2. Move/adjust related tests to remain colocated with moved modules.
3. Update all imports from old paths to new feature-owned paths.
4. Remove temporary re-export shims by phase end unless needed for same-phase safety.

## Validation

- `pnpm lint`
- `pnpm test`
- `pnpm build`

## Exit criteria

- Live protocol internals are feature-local.
- No active imports depend on deprecated legacy paths.
- Test coverage remains equivalent.

## Stop conditions

- If another feature depends on these modules, reevaluate whether module is truly live-specific or should stay in shared `src/lib`.
