# Testing Conventions

This document defines test placement, naming, and scope for Pub.

## Test levels

- Unit and component tests: colocated with source as `*.test.ts` or `*.test.tsx`.
- End-to-end tests: `web/tests/e2e/specs/*.spec.ts`.
- E2E helpers and fixtures: `web/tests/e2e/helpers/*`.
- E2E screenshot baselines: `web/tests/e2e/snapshots/*`.

## Why colocate unit/component tests

- Keeps tests near implementation.
- Makes refactors safer and easier.
- Encourages coverage for local behavior.

## Why centralize E2E tests

- E2E coverage is cross-feature and user-journey focused.
- Shared setup and screenshot utilities stay in one place.

## Naming

- Unit/component: `<module>.test.ts(x)`
- E2E: `<journey>.spec.ts`

Examples:

- `web/src/features/live/components/panels/chat-panel.test.tsx`
- `web/tests/e2e/specs/control-bar-screenshots.spec.ts`

## Snapshot and screenshot policy

- Only store baselines that guard meaningful UI regressions.
- Keep file names stable and explicit.
- Prefer deterministic rendering helpers before increasing diff tolerance.
- Do not keep obsolete baseline files.

## Debug routes and E2E

Debug pages are allowed when they support deterministic screenshot capture and local development.

Rules:

- Must be dev-gated (`import.meta.env.DEV` guard).
- Must live under `web/src/devtools` for implementation, with route wrappers under `web/src/routes`.
- Must not contain production-only business logic.

## Required Validation

For each phase:

1. Run targeted tests for touched scope.
2. Run `pnpm check` (lint + typecheck + unit tests + knip).

For phases touching e2e harness or debug pages, also run:

1. `pnpm test:e2e`

## Completion Bar

A phase is not complete if it leaves:

- duplicate tests for the same behavior in old and new locations
- dead test utilities
- skipped tests without a linked follow-up task
