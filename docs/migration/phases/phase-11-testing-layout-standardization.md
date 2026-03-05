# Phase 11: Testing Layout Standardization

## Objective

Make test layout consistent and intention-revealing while preserving coverage.

## Scope

- `tests/e2e/*`
- Playwright config paths
- Testing docs

## Tasks

1. Move E2E specs to `tests/e2e/specs/*`.
2. Move E2E helpers to `tests/e2e/helpers/*`.
3. Move screenshot baselines to `tests/e2e/snapshots/*`.
4. Update `playwright.config.ts` `testDir` and helper path usage.
5. Keep unit/component tests colocated under `src`.

## Validation

- `pnpm lint`
- `pnpm test`
- `pnpm build`
- `pnpm test:e2e`

## Exit criteria

- Test layout follows documented convention.
- No stale path references remain.
- Screenshot baselines resolve correctly from new paths.

## Stop conditions

- If screenshot paths become unstable across environments, fix helper logic before continuing.
