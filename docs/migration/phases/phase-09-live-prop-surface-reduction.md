# Phase 09: Live Prop Surface Reduction

## Objective

Reduce prop bloat between live page and child components without hiding state flow.

## Scope

- Live page components and prop contracts.

## Tasks

1. Replace long prop lists with typed grouped view-model objects where appropriate.
2. Keep state ownership explicit in parent model.
3. Only introduce context if it materially improves clarity and avoids prop threading.
4. Remove redundant callbacks and duplicate derived props.
5. Keep component APIs focused and deterministic.

## Validation

- `pnpm lint`
- `pnpm test`
- `pnpm build`
- Live route and control bar related tests

## Exit criteria

- Prop interfaces are smaller and purpose-driven.
- No hidden coupling via implicit globals.
- No behavior regressions in live flows.

## Stop conditions

- If prop grouping obscures ownership or mutation paths, simplify instead of abstracting further.
