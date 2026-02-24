# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is Pub

Pub is a full-stack TypeScript app for publishing static content (HTML, CSS, JS, Markdown, text) with shareable URLs. It includes a web dashboard and a CLI tool.

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

# Single test file
pnpm vitest run path/to/file.test.ts

# Deploy
pnpm deploy:convex    # Deploy Convex backend
```

The CLI (`cli/`) has its own package.json — build with `cd cli && pnpm build` (uses tsup).

### Frontend (`src/`)
- **Routing**: TanStack Router file-based routes in `src/routes/`
  - `__root.tsx` — root layout (header, footer, providers)
  - `index.tsx` — landing page
  - `login.tsx` — OAuth login (GitHub, Google)
  - `dashboard.tsx` — protected; lists publications + API keys
  - `p.$slug.tsx` — publication viewer (renders content by type)
- **Components**: Shadcn UI (`src/components/ui/`) built on Radix primitives
- **State**: Convex queries/mutations via React Query (`@convex-dev/react-query`)
- **Styling**: Tailwind v4 with oklch design tokens in `src/styles/app.css`
- **Path alias**: `~/*` maps to `src/*`

### Backend (`convex/`)
- **Schema** (`schema.ts`): `publications`, `apiKeys`, plus auth tables from `@convex-dev/auth`
- **Publications** (`publications.ts`): CRUD queries/mutations + API-key-authenticated actions
- **API Keys** (`apiKeys.ts`): generate/revoke keys (prefix `pub_`)
- **HTTP routes** (`http.ts`): REST API at `/api/v1/*` and raw content serving at `/serve/:slug`
- **Auth** (`auth.ts`): GitHub + Google OAuth via `@convex-dev/auth`

### CLI (`cli/`)
- **`pubblue`** — Commander.js CLI (`pnpm add -g pubblue` or `pnpm dlx pubblue`)
- Commands: `configure`, `publish`, `publish-content`, `list`, `get`, `update`, `delete`
- Config: `~/.config/pubblue/config.json` or env vars `PUBBLUE_API_KEY` / `PUBBLUE_URL`
- API client in `cli/src/lib/api.ts`

### Integrations
- **Sentry**: error tracking + performance (configured in `src/lib/sentry.ts`, Vite plugin for source maps)
- **PostHog**: product analytics with centralized event tracking in `src/lib/analytics.ts`

## Testing

Tests use Vitest in node environment. Test files live next to source: `*.test.ts`.

- `src/lib/utils.test.ts` — cn() utility
- `src/utils/seo.test.ts` — SEO helper
- `convex/publications.test.ts` — publication business logic
- `convex/apiKeys.test.ts` — API key logic
- `convex/http.test.ts` — HTTP endpoint integration
- `cli/src/lib/*.test.ts` — CLI api client + config

## Code Style

Biome handles linting and formatting:
- 2-space indent, 100-char line width, double quotes, trailing commas, semicolons
- `noUnusedImports` and `noUnusedVariables`: error
- `noNonNullAssertion` and `noExplicitAny`: warn
- Auto-organized imports via Biome assist
- `noDangerouslySetInnerHtml` disabled only for `p.$slug.tsx`

## Environment Variables

Client-side vars use `VITE_` prefix. See `.env.local.example` for the full list. Key ones:
- `VITE_CONVEX_URL` / `VITE_CONVEX_SITE_URL` — Convex endpoints
- `VITE_SENTRY_DSN`, `VITE_POSTHOG_KEY` — observability
- Auth secrets (`AUTH_GITHUB_*`, `AUTH_GOOGLE_*`) are set in the Convex dashboard, not in `.env`
