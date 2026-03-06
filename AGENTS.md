# Pub

## What is Pub

Pub is a full-stack TypeScript app for helping an AI agent show and visualize output over the web. A pub can have static content (HTML, Markdown, text), a live mode, or both. It includes a web dashboard, a CLI tool, and a Claude Code skill.

## Commands

```bash
# Development
pnpm dev              # Start both web + Convex backend (runs convex dev --once first)
pnpm dev:web          # Vite dev server only
pnpm dev:db           # Convex backend dev server only

# Validation (`pnpm check` runs lint + test + build + knip)
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
  - `dashboard.tsx` — protected; paginated pubs (with view counts + expiry badges) + API keys + RSS feed URL + Telegram linking
  - `explore.tsx` — public discovery feed; paginated list of all public pubs
  - `p.$slug.tsx` — unified pub page (no app chrome); handles content viewing AND live mode; auth-aware for private pubs; "Go Live" toggle when live is active
  - `link.tsx` — Telegram account linking flow
  - `auth.callback.tsx` — OAuth callback handler
  - `debug.auth.tsx` — Auth debug page (dev only, gated via `import.meta.env.DEV`)
- **Components**: Shadcn UI (`src/components/ui/`) built on Radix primitives; live session components in `src/features/live/components/`
- **Icons**: `lucide-react` for UI icons; `@icons-pack/react-simple-icons` for brand icons (GitHub, Google, etc.)
- **State**: Convex queries/mutations via React Query (`@convex-dev/react-query`)
- **Styling**: Tailwind v4 with oklch design tokens in `src/styles/app.css`
- **Telegram Mini App**: `@telegram-apps/sdk-react` v3 for TMA detection, theme, back button, deep link routing via `startapp` parameter
- **Path alias**: `~/*` maps to `src/*`

### Backend (`convex/`)
- **Schema** (`schema.ts`): `pubs` (content/contentType optional, `by_slug`/`by_user`/`by_public` indexes), `lives` (WebRTC signaling with browser-initiated flow: `browserOffer`/`agentAnswer`/`browserSessionId`/`lastTakeoverAt`, `by_slug`/`by_user` indexes), `agentPresence` (per-user online/offline status), `apiKeys`, `linkTokens`, plus auth tables
- **Pubs** (`pubs.ts`): unified CRUD + live management — `getBySlug`, `listByUser`, `listPublic`, `toggleVisibility`, `deleteByUser`, `requestLive`, `getLiveBySlug`, `listActiveLives`, `takeoverLive`, `storeAgentAnswer`, `storeBrowserCandidates`, `getPendingLiveForAgent`, `getActiveLiveForAgent`, `closeLive`, `expireLive`; limit: 10 total pubs per user; 1 live per user; expiring pubs and lives via scheduler
- **Presence** (`presence.ts`): agent presence management — `goOnline`, `heartbeat`, `goOffline`, `checkStaleness`, `isAgentOnline`; heartbeat interval 30s, staleness threshold 90s
- **API Keys** (`apiKeys.ts`): generate/revoke keys (prefix `pub_`), SHA-256 hashed
- **HTTP routes** (`http/pub_routes/`): REST API at `/api/v1/pubs` with live sub-resource; agent routes at `/api/v1/agent/` (online, heartbeat, offline, live poll, signal, close); OG image at `/og/:slug`; RSS at `/rss/:userId`; content serving at `/serve/:slug` with view tracking
- **Analytics** (`analytics.ts`): view counting via `@convex-dev/sharded-counter`
- **Rate Limiting** (`rateLimits.ts`): per-key and per-IP limits via `@convex-dev/rate-limiter`
- **Auth** (`auth.ts`): GitHub + Google OAuth via `@convex-dev/auth`
- **Telegram** (`telegram.ts`): account linking via token-based flow
- **Components** (`convex.config.ts`): registers `rateLimiter` and `shardedCounter` components
- **Default visibility**: pubs are **private by default**

### Pub Limits
- **Total**: max 10 pubs per user (enforced on create)
- **Live**: max 1 concurrent live per user (reopening the same slug closes the previous live first)
- These are free-tier limits; will become plan-dependent when paid plans are added

### CLI (`cli/`)
- **`pubblue`** — Commander.js CLI (`pnpm add -g pubblue` or `pnpm dlx pubblue`)
- **Pub commands**: `configure`, `create`, `get`, `list`, `update`, `delete`
- **Live commands**: `start`, `stop`, `status`, `write`, `read`, `channels`, `doctor`
- `create [file]` — supports `--slug`, `--title`, `--public`/`--private`, `--expires <duration>`
- `update <slug>` — supports `--file`, `--title`, `--public`/`--private`, `--slug <newSlug>` for rename
- `get --content` outputs raw content to stdout (pipeable)
- `list` — auto-paginates through all pages; shows `[live]` for pubs that are live
- `start --agent-name <name>` — registers agent presence and starts the per-user daemon; optional `--bridge openclaw|claude-code`; `--agent-name` is required and shown in browser UI
- `stop` — deregisters agent presence, closes active live, stops daemon
- `write [message]` — write to live channel (`-c <channel>`, `-f <file>`); slug resolved via daemon IPC
- `read` — read buffered messages (`--follow` for streaming); slug resolved via daemon IPC
- `doctor` — end-to-end live health checks; slug resolved via daemon IPC
- `configure --set telegram.botToken=<token>` — enables Telegram Mini App deep links
- Config: `~/.openclaw/pubblue/config.json` or env var `PUBBLUE_API_KEY`
- Config dir resolution: `PUBBLUE_CONFIG_DIR` → `OPENCLAW_STATE_DIR/pubblue` → `OPENCLAW_HOME/.openclaw/pubblue` (or `~/.openclaw/pubblue`)
- OpenClaw state dir resolution: `OPENCLAW_STATE_DIR` → `OPENCLAW_HOME/.openclaw` (or `~/.openclaw`)
- OpenClaw workspace resolution: `OPENCLAW_WORKSPACE` → `OPENCLAW_CONFIG_PATH` (`agents.defaults.workspace` / legacy `workspace`) → `OPENCLAW_STATE_DIR/workspace` (or `~/.openclaw/workspace`)
- Base URL is hardcoded to `https://silent-guanaco-514.convex.site`; override with `PUBBLUE_URL` env var

### Content Serving
- **`/p/:slug`** — SPA route → unified pub page (content + live mode toggle), auth-aware
- **`/serve/:slug`** — Convex HTTP endpoint, serves **public content only** with OG meta tags and view tracking
- **`/og/:slug`** — Dynamic SVG Open Graph image for social previews
- **`/rss/:userId`** — RSS 2.0 feed of user's public pubs
- Env vars: `PUB_PUBLIC_URL` (Convex, e.g. `https://pub.blue`)

### Skills (`skills/`)
- **`pubblue`** — Claude Code skill for publishing and visualizing agent output via the CLI
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

## Working Preferences (Corrected)

- Prefer explicit, debuggable failures; avoid silent fallbacks in CLI/daemon/bridge paths.
- Avoid Tailwind arbitrary-value or arbitrary-selector utility patterns in UI classes (for example `text-[...]`, `[&_...]`) unless there is no practical alternative.

## Frontend Structure and Testing References

- Frontend structure conventions: `@docs/frontend-structure.md`
- Testing layout and naming conventions: `@docs/testing-conventions.md`

Use the docs above as the authoritative source for migration behavior and conventions. Keep `AGENTS.md` high-level and avoid copying detailed policy text from those docs here.
