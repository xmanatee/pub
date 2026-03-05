# Phase 04: Dashboard Page Extraction

## Objective

Move dashboard page orchestration out of route file and into `features/dashboard`.

## Scope

- `src/routes/dashboard.tsx`
- New `src/features/dashboard/page/*`

## Tasks

1. Create `features/dashboard/page/dashboard-page.tsx`.
2. Move `Dashboard`, `PubsTab`, and `ApiKeysTab` from route file into feature page modules.
3. Keep auth redirect behavior unchanged.
4. Keep sign-out, analytics, and tab tracking behavior unchanged.
5. Reduce route file to wrapper only.

## Validation

- `pnpm lint`
- `pnpm test`
- `pnpm build`
- `pnpm test:e2e` (dashboard flows/screenshots)

## Exit criteria

- Dashboard route file is thin.
- Feature page owns dashboard orchestration.
- No logic duplication between route and feature page.

## Stop conditions

- If auth redirect behavior differs from baseline, stop and restore parity.
