# Frontend Structure Conventions

This document defines frontend ownership and dependency direction.

## Goals

- Keep feature code discoverable.
- Keep route files thin and predictable.
- Keep imports directional and acyclic.
- Keep shared code truly shared.

## Top-level ownership

- `src/routes/*`: route registration and route-level guards only. No feature-heavy UI or orchestration logic.
- `src/features/<feature>/*`: all feature UI, hooks, types, and feature-local utilities.
- `src/components/ui/*`: design-system primitives only.
- `src/lib/*`: cross-feature infrastructure (analytics, telemetry, app-wide integrations).
- `src/hooks/*`: cross-feature hooks only.
- `src/devtools/*`: development-only debug tooling and pages.

## Route Wrapper Rule

Each route file should primarily:

1. define `createFileRoute(...)`
2. import one page component from `src/features/*/page/*` (or `src/devtools/pages/*` for debug routes)
3. render it

Allowed extras in route files:

- minimal route-level redirects/guards
- route param extraction and pass-through to page component

Not allowed in route files:

- large local component trees
- feature state machines
- long orchestration hooks

Debug-route exception:

- `/debug/*` routes may import from `src/devtools/pages/*` and use `requireDevRoute`.

## Feature folder template

Use this internal layout when a feature is non-trivial:

```text
src/features/<feature>/
  page/
  components/
  hooks/
  model/
  types/
  lib/
  utils/
```

Only create subfolders that are needed.

## Import direction rules

Allowed directions:

- `routes -> features`
- `features -> components/ui`
- `features -> lib`
- `features -> hooks` (cross-feature only)
- `features/<x> -> features/<x>`

Disallowed directions:

- `lib -> features`
- `components/ui -> features`
- `features/<x> -> routes`

When a feature needs something from another feature, prefer extracting that logic into `src/lib` or `src/hooks` if it is truly shared.

## Naming

- Components: `kebab-case.tsx` files, `PascalCase` exports.
- Hooks: `use-*.ts` files.
- Pure model logic: `*-machine.ts`, `*-model.ts`, `*-protocol.ts`.
- Types: colocate close to usage; promote to `types/` when reused by 3+ modules.

## State and error handling

- Prefer explicit failures over silent fallbacks.
- Do not add defensive state that cannot occur in valid execution.
- Avoid `try/catch` that only logs and swallows errors.
- Keep one source of truth for each state domain.

## Completion Checklist

A frontend restructure is complete when:

- Route files are thin wrappers.
- Feature logic is owned by `src/features/*`.
- No temporary re-export shims remain.
- No dead modules or duplicate implementations remain.
- `pnpm check` and `pnpm test:e2e` pass.
