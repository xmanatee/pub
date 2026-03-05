# Phase 01: Conventions and Governance

## Objective

Define concrete frontend and testing conventions, and make them discoverable from `AGENTS.md` without duplicating full policy text.

## Scope

- Documentation only.
- No runtime behavior changes.
- No file moves yet.

## Tasks

1. Add `docs/frontend-structure.md`.
2. Add `docs/testing-conventions.md`.
3. Add phase plan docs under `docs/migration/phases/*`.
4. Add concise references from `AGENTS.md` to those docs.
5. Keep `AGENTS.md` high-level; do not copy large policy blocks into it.

## Validation

- `pnpm lint`
- `pnpm test`
- `pnpm build`

## Exit criteria

- Docs exist and are concrete.
- `AGENTS.md` references docs directly.
- No duplicate convention text blocks between `AGENTS.md` and docs.

## Stop conditions

- If conventions conflict with existing automated checks, update docs before moving to Phase 02.
