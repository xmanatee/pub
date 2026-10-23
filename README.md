# Pub

Adaptive interfaces, powered by your agent. Real-time UI generation, interactive apps, and persistent experiences at [pub.blue](https://pub.blue).

## Features

- Agent-generated adaptive interfaces — charts, dashboards, forms, and more
- Real-time live sessions via WebRTC peer-to-peer connections
- Static content publishing with persistent URLs
- Web dashboard for managing apps, agents, and API keys
- Explore feed for discovering agent-built apps and experiences
- CLI tool (`pub`) for creating and managing interfaces from the terminal
- Claude Code and OpenClaw bridge support for live agent-to-browser sessions
- API key authentication for programmatic access
- Open Graph preview images
- Telegram account linking

## Quick Start

### Prerequisites

- Node.js 20+
- [pnpm](https://pnpm.io/)
- A [Convex](https://convex.dev) account

### Setup

```bash
# Install dependencies
pnpm install

# Initialize Convex (creates a new project)
npx convex dev --once --configure=new

# Copy env example and fill in your Convex URL
cp .env.local.example .env.local

# Set OAuth secrets in Convex (optional, for login)
npx convex env set AUTH_GITHUB_ID <your-github-oauth-id>
npx convex env set AUTH_GITHUB_SECRET <your-github-oauth-secret>
npx convex env set AUTH_GOOGLE_ID <your-google-oauth-id>
npx convex env set AUTH_GOOGLE_SECRET <your-google-oauth-secret>

# Start dev server
pnpm dev
```

### CLI

```bash
# Install
curl -fsSL https://pub.blue/install.sh | bash

# Configure with your API key (generate one from the dashboard)
pub config --api-key pub_KEY
pub config --auto

# Create an app
pub create my-app.html

# Start a live session
pub start --agent-name "<agent-name>"
pub write -c canvas -f ./interface.html
```

## Development

```bash
pnpm dev          # Start web + Convex backend
pnpm typecheck    # TypeScript across shared, web, super-app, CLI and relay
pnpm lint         # Biome and architecture checks
pnpm test         # Run tests
pnpm build        # Production build
pnpm check        # Fast lint, unit tests and unused-code checks used by CI
pnpm check:all    # Complete local checks, build and Docker full-stack E2E
```

## Tech Stack

- **Frontend**: React 19, TanStack Router, Tailwind v4, Radix UI
- **Backend**: [Convex](https://convex.dev) (database, serverless functions, file serving)
- **Auth**: GitHub & Google OAuth via `@convex-dev/auth`
- **CLI**: Commander.js, distributed as standalone binary (`curl -fsSL pub.blue/install.sh | bash`)
- **Observability**: Sentry (errors), PostHog (analytics)

## Project Structure

```
web/           Frontend (TanStack Router file-based routes)
convex/        Backend (Convex schema, functions, HTTP routes)
cli/           CLI tool (pub)
shared/        Shared protocol types
skills/        Claude Code skill
```

See [AGENTS.md](AGENTS.md) for detailed architecture documentation.

## License

[MIT](LICENSE)

## Self-hosted web releases

Use Node from `.nvmrc` and the pinned pnpm version. `pnpm deploy` checks and builds
committed, pushed `main`, then publishes the web image privately and an immutable
`release-web-<SHA>` manifest. Ansible serves `pub.blue` and `sandbox.pub.blue` on
Jump. Convex and the Cloudflare relay retain their existing hosting.

`check:web` covers frontend and shared/backend contracts used by that frontend;
`check` retains the complete repository suite. Deployment preserves the existing
whole-repository dependency audit. Convex bindings and the router tree are
committed so frontend checks need no cloud credentials. Browser telemetry,
recording, analytics and crash uploads are disabled.

The CLI retains its independent binary release workflow and latest-release
pointer; web publication never replaces it. Both native and web releases stage
all assets in a draft before immutable publication. Old Vercel automatic web
releases are disabled.
