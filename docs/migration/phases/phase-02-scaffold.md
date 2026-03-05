# Phase 02: Feature Scaffold

## Objective

Create the new folder skeleton so later moves are mechanical and low-risk.

## Scope

- Add folders only.
- No logic moves.
- No import path rewrites beyond minimal placeholders.

## Tasks

1. Create `src/features/{landing,dashboard,live,pub}` with `page/components/hooks/model/types/lib/utils` as needed.
2. Create `src/devtools/{pages,components}`.
3. Do not introduce barrels unless needed for immediate import stability.
4. Document any intentionally empty folders with `.gitkeep` only where required.

## Validation

- `pnpm lint`
- `pnpm test`
- `pnpm build`

## Exit criteria

- New directory tree exists.
- Existing app behavior is unchanged.
- No dead placeholder code added.

## Stop conditions

- If scaffold introduces import or tooling ambiguity, resolve before file moves.
