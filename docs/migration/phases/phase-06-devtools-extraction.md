# Phase 06: Devtools Extraction

## Objective

Move debug implementation into `src/devtools` while keeping existing debug routes and URLs stable.

## Scope

- `src/routes/debug.*.tsx`
- New `src/devtools/pages/*` and `src/devtools/components/*`

## Tasks

1. Move debug page component implementations to `src/devtools/pages/*`.
2. Move debug-specific shared pieces (for example batch sections) to `src/devtools/components/*`.
3. Keep route files as thin wrappers that still enforce `import.meta.env.DEV` guards.
4. Keep URL paths unchanged to avoid breaking Playwright specs.

## Validation

- `pnpm lint`
- `pnpm test`
- `pnpm build`
- `pnpm test:e2e` (all screenshot specs that hit `/debug/*`)

## Exit criteria

- Devtools code is isolated from feature production code.
- Debug routes still work in dev and remain blocked outside dev.
- Screenshot suite remains green.

## Stop conditions

- If any debug page contains production business logic, extract that logic before continuing.
