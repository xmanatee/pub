# Pub

Full-stack TypeScript app for adaptive interfaces powered by AI agents. A pub is content that can be static, live, or both. The stack is a web app, a CLI, and a Cloudflare Worker relay.

## Non-negotiable

- **Bridge owns chat delivery.** Providers forward the agent's assistant text to the chat channel via `sendMessage`. `pub write` is reserved for non-chat channels (canvas, attachments) and non-live scripting.
- **Never modify `components/ui/`.** Extend shadcn primitives by composition.

## Conventions

- **Routing** — TanStack Router file-based routes. Auth guards live in layout routes (`_authenticated`, `_guest`); there is no `AuthGuard` component.
- **State** — `@convex-dev/react-query` bridges Convex with TanStack Router loaders. No React Context for app state.
- **Styling** — Tailwind v4, oklch tokens. No arbitrary-value Tailwind (`text-[...]`, `[&_...]`) unless nothing else works.
- **Icons** — `lucide-react` for UI, `@icons-pack/react-simple-icons` for brand.
- **Cascade deletion** — New FK tables must be registered in `USER_OWNED_TABLES` / `PUB_OWNED_TABLES` in `user_data.ts`. Structural tests in `user_data.test.ts` enforce it.
- **OG metadata** — HTML meta tags are the single source of truth for pub preview fields. Do not persist duplicates; re-extract on update.

## Business rules

- Max 10 pubs per user free-tier (200 subscribed).
- Max 1 live connection per host; max 1 per slug. A new connection replaces the previous.
- Pubs are always created private.

## Skill authoring

- `SKILL.md` holds deterministic runtime instructions.
- Meta-guidance about skills belongs here, not in `SKILL.md`.
- When CLI behavior changes, update `SKILL.md`, `claw.json` version, and this file together.

## Worktree screenshot tests

Screenshot tests in `tests/e2e/` need Convex codegen and the TanStack route tree (both gitignored). In a worktree, copy `convex/_generated/*` and `web/src/routeTree.gen.ts` from the main worktree before running.

## Detail

- Frontend conventions → `@docs/frontend-structure.md`
- Testing conventions → `@docs/testing-conventions.md`
