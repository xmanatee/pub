# Pub

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
  - `__root.tsx` — root layout (header with Explore link, footer, providers)
  - `index.tsx` — landing page
  - `login.tsx` — OAuth login (GitHub, Google)
  - `dashboard.tsx` — protected; paginated publications (with view counts + expiry badges) + API keys + RSS feed URL + Telegram linking
  - `explore.tsx` — public discovery feed; paginated list of all public publications
  - `p.$slug.tsx` — full-screen content viewer (no app chrome, auth-aware for private pubs)
  - `t.$tunnelId.tsx` — WebRTC tunnel page (authenticated, fullscreen canvas + chat, ChatGPT-style control bar with voice/record)
  - `link.tsx` — Telegram account linking flow
  - `auth.callback.tsx` — OAuth callback handler
  - `debug.auth.tsx` — Auth debug page (dev only, gated via `import.meta.env.DEV`)
- **Components**: Shadcn UI (`src/components/ui/`) built on Radix primitives; tunnel-specific components in `src/components/tunnel/`
- **Icons**: `lucide-react` for UI icons; `@icons-pack/react-simple-icons` for brand icons (GitHub, Google, etc.)
- **State**: Convex queries/mutations via React Query (`@convex-dev/react-query`)
- **Styling**: Tailwind v4 with oklch design tokens in `src/styles/app.css`
- **Path alias**: `~/*` maps to `src/*`

### Backend (`convex/`)
- **Schema** (`schema.ts`): `publications` (with `expiresAt`, `by_public` index), `apiKeys`, `linkTokens`, plus auth tables
- **Publications** (`publications.ts`): CRUD + pagination (`listByUser`, `listPublic`), pub limits (20 public / 100 private), expiring pubs via scheduler, slug rename
- **API Keys** (`apiKeys.ts`): generate/revoke keys (prefix `pub_`), SHA-256 hashed
- **HTTP routes** (`http.ts`): REST API with rate limiting, slug rename, expiry, pagination; OG image at `/og/:slug`; RSS at `/rss/:userId`; content serving at `/serve/:slug` with view tracking
- **Analytics** (`analytics.ts`): view counting via `@convex-dev/sharded-counter`
- **Rate Limiting** (`rateLimits.ts`): per-key and per-IP limits via `@convex-dev/rate-limiter`
- **Auth** (`auth.ts`): GitHub + Google OAuth via `@convex-dev/auth`
- **Telegram** (`telegram.ts`): account linking via token-based flow
- **Components** (`convex.config.ts`): registers `rateLimiter` and `shardedCounter` components
- **Default visibility**: publications are **private by default**

### Publication Limits
- **Public**: max 20 per user (enforced on create and toggle)
- **Private**: max 100 per user (enforced on create)
- These are free-tier limits; will become plan-dependent when paid plans are added

### CLI (`cli/`)
- **`pubblue`** v0.4.4 — Commander.js CLI (`pnpm add -g pubblue` or `pnpm dlx pubblue`)
- Commands: `configure`, `create`, `get`, `list`, `update`, `delete`
- `create [file]` — supports `--slug`, `--title`, `--public`/`--private`, and `--expires <duration>` (e.g. `1h`, `24h`, `7d`)
- `update <slug>` — supports `--file`, `--title`, `--public`/`--private`, `--slug <newSlug>` for rename
- `get --content` outputs raw content to stdout (pipeable)
- `list` — auto-paginates through all pages
- Config: `~/.config/pubblue/config.json` or env var `PUBBLUE_API_KEY`
- Base URL is hardcoded to `https://silent-guanaco-514.convex.site`; override with `PUBBLUE_URL` env var

### Content Serving
- **`/p/:slug`** — SPA route → full-screen renderer (no app chrome), auth-aware via `getBySlug` query
- **`/serve/:slug`** — Convex HTTP endpoint, serves **public content only** with OG meta tags and view tracking
- **`/og/:slug`** — Dynamic SVG Open Graph image for social previews
- **`/rss/:userId`** — RSS 2.0 feed of user's public publications
- Env vars: `PUB_PUBLIC_URL` (Convex, e.g. `https://pub.blue`)

### Skills (`skills/`)
- **`pubblue`** — Claude Code skill for publishing content via the CLI
- Each skill has a `SKILL.md` (instructions) and `claw.json` (ClawHub manifest)
- Published to ClawHub automatically on push to `main` (see `.github/workflows/clawhub.yml`)

#### Skill Authoring Rules
- Put **runtime/operator instructions** in `SKILL.md` only (commands, prerequisites, limits, troubleshooting).
- Keep `SKILL.md` deterministic: exact commands, version floors, expected outcomes.
- Do **not** put meta-guidance in `SKILL.md` about how to write skills.
- Put **meta-guidance for agents/maintainers** in `AGENTS.md` (this file).
- When CLI behavior changes, update `SKILL.md`, `claw.json` version, and AGENTS command notes together.

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
