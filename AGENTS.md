# Pub

## What is Pub

Pub is a full-stack TypeScript app for adaptive interfaces powered by AI agents. Agents generate real-time UIs — apps, dashboards, interactive experiences — that adapt to what the user needs. A pub can have static content, a live mode, or both. It includes a web app, a CLI tool, and a Claude Code skill.

## Commands

```bash
# Development
pnpm dev              # Start both web + Convex backend (runs convex dev --once first)
pnpm dev:web          # Vite dev server only
pnpm dev:db           # Convex backend dev server only

# Validation (`pnpm check` runs build + lint + test + knip)
pnpm build            # vite build (generates route tree)
pnpm lint             # Biome check + tsc --noEmit + no-raw-anchor
pnpm test             # vitest run (root + web)

# Fixing
pnpm lint:fix         # Biome auto-fix
pnpm format           # Biome format

# Screenshot tests (Playwright, tests/e2e/)
pnpm test:e2e                        # Run all e2e + screenshot tests
pnpm test:e2e -- --grep "pubs"       # Run only pubs screenshot tests
UPDATE_SNAPSHOTS=1 pnpm test:e2e     # Update screenshot baselines
```

### Worktree Setup for Screenshot Tests

Screenshot tests (`tests/e2e/`) require Convex codegen and the TanStack Router route tree, which are gitignored. In a worktree, copy them from the main worktree before running:

```bash
mkdir -p convex/_generated
cp <main-worktree>/convex/_generated/* convex/_generated/
cp <main-worktree>/web/src/routeTree.gen.ts web/src/routeTree.gen.ts
```

The CLI (`cli/`) has its own package.json — build with `cd cli && pnpm build` (uses Bun compile).

### Frontend (`web/src/`)
- **Routing**: TanStack Router file-based routes in `web/src/routes/`
  - `__root.tsx` — root layout (header with AppNav for authenticated users, footer, providers)
  - `_authenticated.tsx` — layout route guard (`beforeLoad: requireAuth`); all protected routes nest under this
  - `_guest.tsx` — layout route guard (`beforeLoad: requireGuest`); redirects authenticated users to `/pubs`
  - `_authenticated.pubs.tsx` — pubs list, sort, go-live FAB; onboarding guide for new users
  - `_authenticated.agents.tsx` — API key management, CLI install command
  - `_authenticated.settings.tsx` — linked accounts, live model, developer mode, telemetry, sign out, delete account
  - `explore.tsx` — public discovery feed; paginated list of public agent-built apps and experiences
  - `p.$slug.tsx` — unified pub page (no app chrome); handles content viewing and owner live mode; auth-aware for private pubs
  - `_guest.index.tsx` — landing page
  - `_guest.login.tsx` — OAuth login (GitHub, Google)
  - `link.tsx` — Telegram account linking flow
  - `auth.callback.tsx` — OAuth callback handler
  - `debug.*.tsx` — debug pages (dev only)
- **Navigation**: `AppNav` component in header provides Pubs, Agents, Explore links and Settings icon for authenticated users. Auth guards are handled entirely by layout routes (`_authenticated`, `_guest`); no `AuthGuard` component exists.
- **Components**: Shadcn UI (`web/src/components/ui/`) built on Radix primitives; live session components in `web/src/features/live/components/`
- **Icons**: `lucide-react` for UI icons; `@icons-pack/react-simple-icons` for brand icons (GitHub, Google, etc.)
- **State**: Convex queries/mutations via `convex/react` hooks; `@convex-dev/react-query` bridges Convex with TanStack Router loaders
- **Styling**: Tailwind v4 with oklch design tokens in `web/src/styles/app.css`
- **Telegram Mini App**: `@telegram-apps/sdk-react` v3 for TMA detection, theme, back button, deep link routing via `startapp` parameter
- **Path aliases**: `~/*` → `web/src/*`, `@backend/*` → `convex/*`, `@shared/*` → `shared/*`
- **Package**: `web/package.json` (`pub-web`) — web-specific deps and scripts

### Backend (`convex/`)
- **Schema** (`schema.ts`): `users` (profile, flags: `isDeveloper`/`isSubscribed`, `liveModelProfile`), `pubs` (title/description/themeColor/iconUrl optional — extracted from OG/meta tags in HTML, `viewCount` for analytics, indexes: `by_slug`, `by_user`, `by_public`, plus compound sort indexes `by_user_lastViewedAt`/`by_user_updatedAt`/`by_user_createdAt`/`by_user_viewCount`), `hosts` (agent daemon sessions: `userId`/`apiKeyId`/`agentName`/`daemonSessionId`/`status`/`lastHeartbeatAt`, indexes: `by_user`/`by_api_key`/`by_api_key_session`), `connections` (WebRTC signaling: `hostId`/`browserOffer`/`agentAnswer`/`agentCandidates`/`browserCandidates`/`activeSlug`, indexes: `by_user`/`by_host`/`by_active_slug`), `pubFiles` (per-file content storage: `pubId`/`path`/`content`/`size`, indexes: `by_pub`/`by_pub_path`), `pubAccessTokens` (short-lived owner-only content access tokens: `pubId`/`userId`/`token`/`expiresAt`, indexes: `by_token`/`by_user_pub`/`by_pub`), `apiKeys`, `linkTokens`, `telegramBots`, plus auth tables
- **Pubs** (`pubs.ts`): CRUD — `getBySlug`, `listByUser` (paginated, server-side sorted by `sortKey`), `listPublic`, `toggleVisibility`, `duplicateByUser`, `deleteByUser`, `createDraftForLive`; limit: 10 total pubs per user (200 for subscribed)
- **Connections** (`connections.ts`): WebRTC signaling and live session management — `requestConnection`, `takeoverConnection`, `closeConnectionByUser`, `storeBrowserCandidates`, `updateActiveSlug`, `listActiveConnections`, `getConnectionBySlug`, `getConnectionForAgent`; plus internal: `signalConnection`, `closeConnection`, `getConnectionForHost`; max 1 connection per host, max 1 connection per slug
- **Presence** (`presence.ts`): host lifecycle management — `goOnline`, `heartbeat`, `goOffline`, `checkStaleness`, `isCurrentUserAgentOnline`, `getOnlineAgentCount`, `listAvailableForSlug`; heartbeat interval 30s, staleness threshold 90s; host going offline cascades to closing all its connections
- **API Keys** (`apiKeys.ts`): generate/revoke keys (prefix `pub_`), SHA-256 hashed
- **Account** (`account.ts`): `disconnectProvider` (with guard: at least 1 provider must remain), `deleteAccount` (cascading delete of all user data)
- **Cascade deletion** (`user_data.ts`): `USER_OWNED_TABLES` lists tables with `userId` FK (cascade on account delete), `PUB_OWNED_TABLES` lists tables with `pubId` FK (cascade on pub delete). New tables with these FKs must be added to the respective registry — structural tests in `user_data.test.ts` enforce this
- **HTTP routes** (`http/pub_routes/`): REST API at `/api/v1/pubs` with live sub-resource; agent routes at `/api/v1/agent/` (online, heartbeat, offline, live poll, signal, close); OG image at `/og/:slug`; content serving at `/serve/:slug` with view tracking
- **Analytics** (`analytics.ts`): view recording — increments `viewCount` and updates `lastViewedAt` on the pub document
- **Rate Limiting** (`rateLimits.ts`): per-key and per-IP limits via `@convex-dev/rate-limiter`
- **Auth** (`auth.ts`): GitHub + Google OAuth via `@convex-dev/auth`
- **Telegram** (`telegram.ts`): account linking via token-based flow
- **Components** (`convex.config.ts`): registers `rateLimiter` component
- **Visibility**: pubs are always created private; visibility can be changed via update or the pubs page toggle
- **OG Metadata**: Meta tags in HTML are the single source of truth for pub preview metadata. On create/update, the API extracts `og:title`, `og:description` (with `<title>`/`<meta name="description">` fallbacks), `<meta name="theme-color">`, and `<link rel="apple-touch-icon">`/`<link rel="icon">` and stores them in DB fields (`title`, `description`, `themeColor`, `iconUrl`). Content serving at `/serve/:slug` supplements missing OG tags without duplicating existing ones. Preview cards in the UI render these fields directly (no iframe snapshots).

### Pub Limits
- **Total**: max 10 pubs per user (enforced on create)
- **Live**: max 1 connection per host; max 1 connection per slug (starting a new connection on the same slug or same host replaces the previous; if the host goes offline, its connections close)
- These are free-tier limits; will become plan-dependent when paid plans are added

### CLI (`cli/`)
- **`pub`** — Commander.js CLI (`curl -fsSL pub.blue/install.sh | bash`)
- **Pub commands**: `config`, `create`, `get`, `list`, `update`, `delete`
- **Live commands**: `start`, `stop`, `status`, `write`, `doctor`
- **Bridge utility command**: `channel-server` starts the MCP relay for `bridge.mode=claude-channel`
- `create [file]` — supports `--slug`; always creates private pubs (use `update --public` to change visibility); title/description extracted from OG meta tags in the HTML
- `update <slug>` — supports `--file`, `--public`/`--private`, `--slug <newSlug>` for rename; title/description re-extracted from content on update
- `get --content` outputs raw content to stdout (pipeable)
- `list` — auto-paginates through all pages; shows `[live]` for pubs that are live
- `start --agent-name <name>` — registers agent presence and starts the per-user daemon using saved bridge config; `--agent-name` is required and shown in browser UI; prints log path and current runtime status on success
- `stop` — deregisters agent presence, closes active live, stops daemon
- `status` — shows daemon/runtime state including signaling, bridge session, last error, and log path
- `write [message]` — write to live channel (`-c <channel>`, `-f <file>`); slug resolved via daemon IPC
- `doctor` — end-to-end live health checks; slug resolved via daemon IPC
- `config --set telegram.botToken=<token>` — enables Telegram Mini App deep links
- `config --set bridge.verbose=true` — enables verbose live daemon logging
- `config --auto` — detects a working bridge, runs preflight, and saves bridge mode/path into config
- Config: one `config.json` under the single resolved Pub config directory, plus env overrides like `PUB_API_KEY`
- Config dir resolution: existing `PUB_CONFIG_DIR` → existing `OPENCLAW_HOME/.openclaw/pub` → existing `~/.config/pub`; fail on ambiguity or no directory
- OpenClaw state dir resolution: `OPENCLAW_STATE_DIR` → `OPENCLAW_HOME/.openclaw` (or `~/.openclaw`)
- Bridge cwd resolution: `pub config --auto` only accepts OpenClaw when `OPENCLAW_WORKSPACE` is set, and runtime OpenClaw uses `OPENCLAW_WORKSPACE` or saved `bridge.cwd`
- Base URL is hardcoded to `https://silent-guanaco-514.convex.site`; override with `PUB_BASE_URL` env var

### Content Serving
- **`/p/:slug`** — SPA route → unified pub page (content + live mode toggle), auth-aware
- **`/serve/:slug`** — Convex HTTP endpoint, serves **public content only** with OG meta tags and view tracking
- **`/og/:slug`** — Dynamic SVG Open Graph image for social previews
- Env vars: `PUB_PUBLIC_URL` (Convex, e.g. `https://pub.blue`)

### Skills (`skills/`)
- **`pub`** — Claude Code skill for creating adaptive interfaces via the CLI
- Each skill has a `SKILL.md` (instructions) and `claw.json` (ClawHub manifest)
- Published to ClawHub automatically on push to `main` (see `.github/workflows/clawhub.yml`)

#### Skill Authoring Rules
- Put **runtime/operator instructions** in `SKILL.md` only (commands, prerequisites, limits, troubleshooting).
- Keep `SKILL.md` deterministic: exact commands, version floors, expected outcomes.
- Do **not** put meta-guidance in `SKILL.md` about how to write skills.
- Put **meta-guidance for agents/maintainers** in `AGENTS.md` (this file).
- When CLI behavior changes, update `SKILL.md`, `claw.json` version, and AGENTS command notes together.

### CI (`.github/workflows/`)
- **`ci.yml`** — lint (Biome + tsc), test, build, knip for web app; lint, test, build + smoke test for CLI
- **`cli-binary.yml`** — auto-releases CLI binaries when `cli/package.json` version changes on `main`; creates git tag, builds binaries, uploads to GitHub Releases
- **`clawhub.yml`** — auto-publishes changed skills to ClawHub on push to `main`

### Integrations
- **Sentry**: error tracking + performance (configured in `web/src/lib/sentry.ts`, Vite plugin for source maps)
- **PostHog**: product analytics with centralized event tracking in `web/src/lib/analytics.ts`

## Code Style

Biome handles linting and formatting:
- 2-space indent, 100-char line width, double quotes, trailing commas, semicolons
- `noUnusedImports` and `noUnusedVariables`: error
- `noNonNullAssertion` and `noExplicitAny`: warn
- Auto-organized imports via Biome assist

## Environment Variables

Client-side vars use `VITE_` prefix. See `.env.local.example` for the full list. Key ones:
- `VITE_CONVEX_URL` — Convex cloud endpoint
- `VITE_SANDBOX_ORIGIN` — sandbox iframe origin; required for canvas isolation + pub-fs (`/__sandbox__` for dev, `https://sandbox.pub.blue` for prod)
- `VITE_SENTRY_DSN`, `VITE_POSTHOG_KEY` — observability
- Auth secrets (`AUTH_GITHUB_*`, `AUTH_GOOGLE_*`) are set in the Convex dashboard, not in `.env`

## Nullability Convention

- **`undefined` (via `?`)** for TypeScript-internal optionality — optional params, optional object properties, function returns meaning "not provided"
- **`null`** for data-layer and explicit absence — Convex values, JSON-serialized fields, React refs, protocol parse failures
- **Never `| null | undefined`** in the same type signature unless there is a documented reason (e.g., input validators that must accept any value)
- Prefer `??` over `||` for default values (nullish coalescing handles both `null` and `undefined` without swallowing `0`, `""`, `false`)

## Working Preferences (Corrected)

- Prefer explicit, debuggable failures; avoid silent fallbacks in CLI/daemon/bridge paths.
- Avoid Tailwind arbitrary-value or arbitrary-selector utility patterns in UI classes (for example `text-[...]`, `[&_...]`) unless there is no practical alternative.

## E2E Docker Images

Pinned by sha256 digest in `tests/e2e/`. Update no more than once a week — pull `:latest`, replace the `@sha256:...` value and the `# pinned` date.

## Frontend Structure and Testing References

- Frontend structure conventions: `@docs/frontend-structure.md`
- Testing layout and naming conventions: `@docs/testing-conventions.md`

Use the docs above as the authoritative source for migration behavior and conventions. Keep `AGENTS.md` high-level and avoid copying detailed policy text from those docs here.
