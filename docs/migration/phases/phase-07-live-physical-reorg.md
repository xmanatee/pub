# Phase 07: Live Physical Reorganization

## Objective

Reorganize live feature files into a coherent `features/live` layout with no behavior changes.

## Scope

- Move live components, hooks, model, types, and utilities under `src/features/live/*`.

## Tasks

1. Create live subfolders (`components/control-bar`, `components/panels`, `components/visuals`, `hooks`, `model`, `types`, `lib`, `utils`).
2. Move files physically and update imports.
3. Keep code behavior identical.
4. If temporary re-export shims are needed, mark them clearly and remove them by Phase 12.

## Validation

- `pnpm lint`
- `pnpm test`
- `pnpm build`
- Targeted live and route tests

## Exit criteria

- Live feature directory structure is in place.
- Imports are stable and explicit.
- No unresolved legacy imports remain.

## Stop conditions

- If the move introduces cycles, resolve dependency direction before proceeding.
