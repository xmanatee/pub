# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is Pub

Pub is a full-stack TypeScript app for publishing static content (HTML, Markdown, text) with shareable URLs. It includes a web dashboard, a CLI tool, and a Claude Code skill.

## Commands

```bash
# Development
pnpm dev              # Start both web + Convex backend (runs convex dev --once first)
pnpm dev:web          # Vite dev server only
pnpm dev:db           # Convex backend dev server only

# Validation (run all three with `pnpm check`)
pnpm lint             # Biome check + tsc --noEmit
pnpm test             # vitest run
pnpm build            # vite build + tsc --noEmit

# Fixing
pnpm lint:fix         # Biome auto-fix
pnpm format           # Biome format
```

The CLI (`cli/`) has its own package.json — build with `cd cli && pnpm build` (uses tsup).

### Frontend (`src/`)
- **Routing**: TanStack Router file-based routes in `src/routes/`
  - `__root.tsx` — root layout (header, footer, providers)
  - `index.tsx` — landing page
  - `login.tsx` — OAuth login (GitHub, Google)
  - `dashboard.tsx` — protected; lists publications + API keys + Telegram linking
  - `p.$slug.tsx` — full-screen content viewer (no app chrome, auth-aware for private pubs)
  - `link.tsx` — Telegram account linking flow
  - `auth.callback.tsx` — OAuth callback handler
  - `debug.auth.tsx` — Auth debug page (dev only)
- **Components**: Shadcn UI (`src/components/ui/`) built on Radix primitives
- **State**: Convex queries/mutations via React Query (`@convex-dev/react-query`)
- **Styling**: Tailwind v4 with oklch design tokens in `src/styles/app.css`
- **Path alias**: `~/*` maps to `src/*`

### Backend (`convex/`)
- **Schema** (`schema.ts`): `publications`, `apiKeys`, plus auth tables from `@convex-dev/auth`
- **Publications** (`publications.ts`): CRUD actions (`create`, `read`, `list`, `update`, `delete_`) + web dashboard queries/mutations
- **API Keys** (`apiKeys.ts`): generate/revoke keys (prefix `pub_`)
- **HTTP routes** (`http.ts`): REST API with slug-in-path (`POST /api/v1/publications`, `GET/PATCH/DELETE /api/v1/publications/:slug`) and content serving at `/serve/:slug`
- **Auth** (`auth.ts`): GitHub + Google OAuth via `@convex-dev/auth`
- **Telegram** (`telegram.ts`): account linking via token-based flow
- **Default visibility**: publications are **private by default** when created via API

### CLI (`cli/`)
- **`pubblue`** — Commander.js CLI (`pnpm add -g pubblue` or `pnpm dlx pubblue`)
- Commands: `configure`, `create`, `get`, `list`, `update`, `delete`
- `create [file]` reads from file (content type inferred from extension) or stdin (defaults to text); supports `--public`/`--private`
- `update <slug>` supports `--file` for new content, `--title`, `--public`/`--private` for metadata
- `get --content` outputs raw content to stdout (pipeable)
- Config: `~/.config/pubblue/config.json` or env var `PUBBLUE_API_KEY`
- Base URL is hardcoded to `https://silent-guanaco-514.convex.site`; override with `PUBBLUE_URL` env var
- API client (`PubApiClient`) in `cli/src/lib/api.ts`

### Content Serving
- **`/p/:slug`** — SPA route → full-screen renderer (no app chrome), auth-aware via `getBySlug` query
- **`/serve/:slug`** — Convex HTTP endpoint, serves **public content only** (raw response, no auth)
- Env vars: `PUB_PUBLIC_URL` (Convex, e.g. `https://pub.blue`)

### Skills (`skills/`)
- **`pubblue`** — Claude Code skill for publishing content via the CLI
- Each skill has a `SKILL.md` (instructions) and `claw.json` (ClawHub manifest)
- Published to ClawHub automatically on push to `main` (see `.github/workflows/clawhub.yml`)

### CI (`.github/workflows/`)
- **`ci.yml`** — lint, test, build for web app + CLI; auto-publishes CLI to npm on version bump
- **`clawhub.yml`** — auto-publishes changed skills to ClawHub on push to `main`

### Integrations
- **Sentry**: error tracking + performance (configured in `src/lib/sentry.ts`, Vite plugin for source maps)
- **PostHog**: product analytics with centralized event tracking in `src/lib/analytics.ts`

## Code Style

Biome handles linting and formatting:
- 2-space indent, 100-char line width, double quotes, trailing commas, semicolons
- `noUnusedImports` and `noUnusedVariables`: error
- `noNonNullAssertion` and `noExplicitAny`: warn
- Auto-organized imports via Biome assist
- `noDangerouslySetInnerHtml` disabled for `p.$slug.tsx`

## Environment Variables

Client-side vars use `VITE_` prefix. See `.env.local.example` for the full list. Key ones:
- `VITE_CONVEX_URL` — Convex cloud endpoint
- `VITE_SENTRY_DSN`, `VITE_POSTHOG_KEY` — observability
- Auth secrets (`AUTH_GITHUB_*`, `AUTH_GOOGLE_*`) are set in the Convex dashboard, not in `.env`
