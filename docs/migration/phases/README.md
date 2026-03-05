# Frontend Migration Phases

This directory defines the execution plan for the frontend structure migration.

## Execution policy

- Apply exactly one phase at a time.
- Keep each phase uncommitted for review.
- Do not combine multiple phases in one commit.
- Do not add behavior changes unless explicitly listed by the phase.
- If a phase uncovers hidden coupling, stop and update the phase file before continuing.

## Quality bar for every phase

- No leftover files from old locations after cutover.
- No duplicate implementations.
- No temporary compatibility code beyond the phase that introduced it.
- No swallowed errors or silent fallbacks.
- No unnecessary state variables.
- No legacy paths referenced by active imports.

## Required checks per phase

1. `pnpm lint`
2. `pnpm test`
3. `pnpm build`
4. If phase touches E2E or debug tooling: `pnpm test:e2e`

## Phase index

1. `phase-01-conventions.md`
2. `phase-02-scaffold.md`
3. `phase-03-landing-extraction.md`
4. `phase-04-dashboard-page-extraction.md`
5. `phase-05-dashboard-component-moves.md`
6. `phase-06-devtools-extraction.md`
7. `phase-07-live-physical-reorg.md`
8. `phase-08-live-model-split.md`
9. `phase-09-live-prop-surface-reduction.md`
10. `phase-10-live-lib-relocation.md`
11. `phase-11-testing-layout-standardization.md`
12. `phase-12-cleanup-enforcement.md`
