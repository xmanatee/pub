# Phase 12: Cleanup and Enforcement

## Objective

Remove migration residue and lock in final architecture quality.

## Scope

- Whole frontend tree and docs.

## Tasks

1. Remove temporary compatibility shims and aliases.
2. Delete empty legacy directories and dead files.
3. Remove redundant state variables and duplicate helpers introduced during migration.
4. Remove unnecessary `try/catch` blocks and swallowed-error paths.
5. Ensure no defensive logic remains without a concrete failure mode.
6. Re-run documentation links and update any stale references.

## Validation

- `pnpm check`
- `pnpm test:e2e`

## Exit criteria

- No leftovers, duplications, or legacy paths.
- Architecture matches `docs/frontend-structure.md`.
- Testing layout matches `docs/testing-conventions.md`.
- All checks pass.

## Stop conditions

- If cleanup removes behavior relied on by tests or production paths, restore behavior first, then revisit cleanup with a narrower scope.
