# Phase 05: Dashboard Component Moves

## Objective

Move dashboard-owned components under feature ownership and clean import paths.

## Scope

- Move components into `src/features/dashboard/components/*`.
- Update consumers and tests.

## Tasks

1. Move dashboard-related components (`pub-card`, `pubs-grid`, `live-banners`, `account-tab`, `copy-button`, `visibility-badge`) into feature folder.
2. Update imports in dashboard and dependent modules.
3. Keep `src/components/ui/*` untouched as shared primitives.
4. Remove old component files after all imports are updated.

## Validation

- `pnpm lint`
- `pnpm test`
- `pnpm build`
- `pnpm test:e2e` (dashboard + any pages that use moved components)

## Exit criteria

- Feature ownership for dashboard components is clear.
- No imports point to removed legacy paths.
- No duplicate component files remain.

## Stop conditions

- If a moved component is reused outside dashboard and truly cross-feature, extract to shared location before deleting old path.
