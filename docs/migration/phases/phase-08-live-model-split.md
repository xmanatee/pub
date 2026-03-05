# Phase 08: Live Model Split

## Objective

Split `use-live-page-model` into focused hooks while preserving external behavior.

## Scope

- Live orchestration hooks under `src/features/live/hooks/*`.

## Tasks

1. Extract session and signaling responsibilities into `use-live-session-model.ts`.
2. Extract transport responsibilities into `use-live-transport.ts`.
3. Keep chat delivery/files/preferences in dedicated hooks.
4. Retain `use-live-page-model` as a thin facade during this phase.
5. Preserve returned contract shape unless explicit cleanup is planned in Phase 09.

## Validation

- `pnpm lint`
- `pnpm test`
- `pnpm build`
- Targeted tests for live hooks and live page route

## Exit criteria

- No single live hook mixes unrelated responsibilities.
- `use-live-page-model` is coordinator-only.
- Behavior is unchanged from user perspective.

## Stop conditions

- If extracted hooks require duplicated state to function, redesign boundaries before merging.
