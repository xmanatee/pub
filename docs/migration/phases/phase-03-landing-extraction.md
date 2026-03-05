# Phase 03: Landing Extraction

## Objective

Move landing page implementation into `features/landing` and keep route file thin.

## Scope

- `src/routes/index.tsx`
- New files under `src/features/landing/*`

## Tasks

1. Create `features/landing/page/landing-page.tsx`.
2. Move section components into `features/landing/sections/*`.
3. Keep `src/routes/index.tsx` as route wrapper and page mount only.
4. Preserve analytics calls and CTA event semantics.
5. Delete old in-route section implementations.

## Validation

- `pnpm lint`
- `pnpm test`
- `pnpm build`
- `pnpm test:e2e` (landing screenshot and smoke)

## Exit criteria

- Route wrapper is thin.
- Landing behavior and visuals remain stable.
- No duplicate section implementations remain.

## Stop conditions

- If CTA tracking changes, stop and restore parity before continuing.
